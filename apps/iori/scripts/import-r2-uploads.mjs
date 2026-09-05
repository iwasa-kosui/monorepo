import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { assertExternalMigrationPath, prepareExternalMigrationDirectory } from './migration-path-safety.mjs';

const execFileAsync = promisify(execFile);
const legacyUploadPath =
  /^\/uploads\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(gif|jpeg|jpg|png|webp)$/i;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const contentTypeFor = (extension) =>
  ({
    gif: 'image/gif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  })[extension.toLowerCase()];

const checksum = (body) => createHash('sha256').update(body).digest('hex');
const postImageKey = (imageId) => `post-images/${imageId}/original`;
const ogpKey = (articleId) => `og/${articleId}.png`;
const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const isPng = (body) => pngSignature.every((byte, index) => body[index] === byte);

const legacyUpload = (upload) => {
  const match = typeof upload.url === 'string' ? legacyUploadPath.exec(upload.url) : null;
  if (match === null || typeof upload.imageId !== 'string' || !uuid.test(upload.imageId)) {
    throw new Error('Upload manifest contains an invalid legacy upload.');
  }
  if (match[1].toLowerCase() !== upload.imageId.toLowerCase()) {
    throw new Error('Upload manifest contains an invalid legacy upload.');
  }
  return { filename: `${match[1]}.${match[2]}`, contentType: contentTypeFor(match[2]) };
};

const uploadsFromManifest = async function*(manifest, manifestPath) {
  if (manifest.uploads !== undefined) {
    if (!Array.isArray(manifest.uploads)) throw new Error('Upload manifest uploads are invalid.');
    yield* manifest.uploads;
    return;
  }
  const postImages = manifest.tables?.post_images;
  if (postImages === undefined) return;
  if (typeof postImages.file !== 'string' || !/^[A-Za-z0-9._-]+\.ndjson$/.test(postImages.file)) {
    throw new Error('Post image export file reference is invalid.');
  }
  if (
    !Number.isSafeInteger(postImages.count)
    || postImages.count < 0
    || typeof postImages.checksum !== 'string'
    || !/^[0-9a-f]{64}$/i.test(postImages.checksum)
  ) {
    throw new Error('Post image export manifest metadata is invalid.');
  }
  const sourcePath = resolve(dirname(manifestPath), postImages.file);
  await assertExternalMigrationPath(sourcePath);
  let sourceStat;
  try {
    sourceStat = await lstat(sourcePath);
  } catch {
    throw new Error('Post image export file is missing.');
  }
  if (sourceStat.isSymbolicLink() || !sourceStat.isFile()) {
    throw new Error('Post image export file must be a regular file without symlinks.');
  }
  const rawChecksum = createHash('sha256');
  for await (const chunk of createReadStream(sourcePath)) rawChecksum.update(chunk);
  if (rawChecksum.digest('hex') !== postImages.checksum) {
    throw new Error('Post image export checksum mismatch.');
  }
  const rowsFromStream = async function*() {
    const lines = createInterface({
      input: createReadStream(sourcePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
    for await (const line of lines) {
      if (line.length === 0) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        throw new Error('Post image export row is invalid.');
      }
      yield { imageId: row.imageId, url: row.url };
    }
  };
  let count = 0;
  for await (const _row of rowsFromStream()) count += 1;
  if (count !== postImages.count) throw new Error('Post image export row count mismatch.');
  yield* rowsFromStream();
};

const writePrivateManifest = async ({ outputDir, filename, manifest }) => {
  const directory = await prepareExternalMigrationDirectory(outputDir);
  const path = join(directory, filename);
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return path;
};

export const importR2Uploads = async ({ sourceDir, bucket, manifestPath, outputDir }) => {
  await Promise.all([assertExternalMigrationPath(sourceDir), assertExternalMigrationPath(manifestPath)]);
  if (outputDir === undefined) throw new Error('An external R2 manifest directory is required.');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const objects = [];
  for await (const upload of uploadsFromManifest(manifest, manifestPath)) {
    const { filename, contentType } = legacyUpload(upload);
    const source = join(sourceDir, filename);
    await assertExternalMigrationPath(source);
    let sourceStat;
    try {
      sourceStat = await lstat(source);
    } catch {
      throw new Error('Referenced upload is missing.');
    }
    if (sourceStat.isSymbolicLink() || !sourceStat.isFile()) {
      throw new Error('Referenced upload must be a regular file without symlinks.');
    }
    const body = new Uint8Array(await readFile(source));
    const object = {
      imageId: upload.imageId,
      key: postImageKey(upload.imageId),
      contentType,
      checksum: checksum(body),
    };
    await bucket.put(object.key, body, {
      httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' },
      customMetadata: { imageId: upload.imageId, sha256: object.checksum },
    });
    objects.push(object);
  }
  const result = { schemaVersion: manifest.schemaVersion, objects };
  return {
    ...result,
    manifestPath: await writePrivateManifest({ outputDir, filename: 'r2-import-manifest.json', manifest: result }),
  };
};

export const backfillPublishedOgpImages = async ({ articles, bucket, generate, outputDir }) => {
  if (outputDir === undefined) throw new Error('An external OGP manifest directory is required.');
  if (!Array.isArray(articles) || articles.length === 0) {
    throw new Error('OGP backfill requires exported articles.');
  }
  const publishedArticles = articles.filter((article) => article.status === 'published');
  const objects = [];
  for (const article of publishedArticles) {
    if (typeof article.articleId !== 'string' || !uuid.test(article.articleId)) {
      throw new Error('Published article has an invalid identifier.');
    }
    const body = await generate(article.title);
    if (!isPng(body)) throw new Error('Offline OGP pipeline must return valid PNG bytes.');
    const object = {
      articleId: article.articleId,
      key: ogpKey(article.articleId),
      contentType: 'image/png',
      checksum: checksum(body),
    };
    await bucket.put(object.key, body, {
      httpMetadata: { contentType: object.contentType, cacheControl: 'public, max-age=31536000, immutable' },
      customMetadata: { articleId: article.articleId, sha256: object.checksum },
    });
    objects.push(object);
  }
  const result = { objects };
  if (objects.length !== publishedArticles.length) throw new Error('OGP backfill manifest is incomplete.');
  return {
    ...result,
    manifestPath: await writePrivateManifest({ outputDir, filename: 'ogp-import-manifest.json', manifest: result }),
  };
};

export const createWranglerBucket = (bucketName, { executeFile = execFileAsync } = {}) => ({
  put: async (key, body, options) => {
    const directory = await mkdtemp(join(tmpdir(), 'iori-r2-import-'));
    const file = join(directory, 'object');
    const metadataFile = join(directory, 'metadata.json');
    try {
      await writeFile(file, body, { mode: 0o600 });
      await writeFile(
        metadataFile,
        JSON.stringify({
          httpMetadata: options.httpMetadata,
          customMetadata: options.customMetadata,
        }),
        { mode: 0o600 },
      );
      await executeFile('wrangler', [
        'r2',
        'object',
        'put',
        `${bucketName}/${key}`,
        '--file',
        file,
        '--content-type',
        options.httpMetadata.contentType,
        '--cache-control',
        options.httpMetadata.cacheControl,
        '--remote',
      ]);
      await executeFile('wrangler', [
        'r2',
        'object',
        'put',
        `${bucketName}/${key}.metadata.json`,
        '--file',
        metadataFile,
        '--content-type',
        'application/json',
        '--cache-control',
        'private, max-age=0',
        '--remote',
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
});

const main = async () => {
  if (!process.argv.includes('--lightsail-stopped')) throw new Error('The Lightsail stop confirmation is required.');
  const outputDir = process.env.IORI_MIGRATION_OUTPUT_DIR;
  const bucketName = process.env.IORI_R2_BUCKET;
  if (outputDir === undefined || bucketName === undefined) {
    throw new Error('Required migration environment is missing.');
  }
  const bucket = createWranglerBucket(bucketName);
  if (process.argv.includes('--backfill-ogp')) {
    const articlesPath = process.env.IORI_OGP_ARTICLES_MANIFEST;
    const pipelinePath = process.env.IORI_OGP_PIPELINE_MODULE;
    if (articlesPath === undefined || pipelinePath === undefined) {
      throw new Error('Required OGP migration environment is missing.');
    }
    await assertExternalMigrationPath(articlesPath);
    const { generate } = await import(pathToFileURL(pipelinePath).href);
    const articles = JSON.parse(await readFile(articlesPath, 'utf8'));
    await backfillPublishedOgpImages({ articles, bucket, generate, outputDir });
    return;
  }
  const sourceDir = process.env.IORI_UPLOAD_SOURCE_DIR;
  const manifestPath = process.env.IORI_EXPORT_MANIFEST;
  if (sourceDir === undefined || manifestPath === undefined) {
    throw new Error('Required migration environment is missing.');
  }
  await importR2Uploads({ sourceDir, manifestPath, bucket, outputDir });
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('R2 migration failed.');
    process.exitCode = 1;
  });
}
