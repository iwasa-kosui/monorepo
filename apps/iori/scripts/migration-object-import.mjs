import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { prepareExternalMigrationDirectory } from './migration-path-safety.mjs';
import { METADATA_BYTES, OBJECT_BYTES, readPrivateBounded, verifiedTableRows } from './migration-file-stream.mjs';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const hash = (body) => createHash('sha256').update(body).digest('hex');
export const objectManifestEnvelope = (kind) => kind === 'uploads' ? '{"schemaVersion":1,"objects":[' : '{"objects":[';
export const serializeObjectEntry = (value) => JSON.stringify(value);
/** Metadata is streamed too; failed output remains private and incomplete. */
const writeObjects = async ({ entries, bucket, outputDir, filename, kind, signal }) => {
  const root = await prepareExternalMigrationDirectory(outputDir);
  const manifestPath = join(root, filename);
  const output = await open(manifestPath, 'wx', 0o600);
  let bytes = 0;
  let count = 0;
  const write = async (text) => {
    bytes += Buffer.byteLength(text);
    if (bytes > METADATA_BYTES) throw new Error('Object manifest exceeds bound.');
    await output.writeFile(text);
  };
  try {
    await write(objectManifestEnvelope(kind));
    for await (const { body, object, metadata } of entries) {
      signal?.throwIfAborted();
      const encoded = serializeObjectEntry(object);
      if (bytes + Buffer.byteLength(encoded) + 4 > METADATA_BYTES) throw new Error('Object manifest exceeds bound.');
      await bucket.put(object.key, body, {
        httpMetadata: { contentType: object.contentType, cacheControl: 'public, max-age=31536000, immutable' },
        customMetadata: { ...metadata, sha256: object.checksum },
      });
      await write((count ? ',' : '') + encoded);
      count++;
    }
    await write(']}\n');
    return { manifestPath, count, bytes };
  } finally {
    await output.close();
  }
};
const table = async (manifestPath, name, signal) => {
  const manifest = JSON.parse(await readPrivateBounded(manifestPath, METADATA_BYTES, signal));
  const descriptor = manifest.tables?.[name];
  if (manifest.complete !== true || descriptor?.file !== `${name}.ndjson`) throw new Error('Invalid exported table.');
  return verifiedTableRows({ path: join(dirname(manifestPath), descriptor.file), descriptor, signal });
};
export const importMigrationUploads = async ({ sourceDir, manifestPath, outputDir, bucket, signal }) => {
  const entries = async function*() {
    for await (const row of await table(manifestPath, 'post_images', signal)) {
      const match = typeof row.url === 'string' && /^\/uploads\/([a-f0-9-]{36})\.(gif|jpe?g|png|webp)$/i.exec(row.url);
      if (!uuid.test(row.imageId ?? '') || !match || match[1].toLowerCase() !== row.imageId.toLowerCase()) {
        throw new Error('Invalid legacy upload.');
      }
      const body = await readPrivateBounded(join(sourceDir, `${match[1]}.${match[2]}`), OBJECT_BYTES, signal);
      const extension = match[2].toLowerCase();
      const contentType = `image/${extension === 'jpg' ? 'jpeg' : extension}`;
      yield {
        body,
        object: { imageId: row.imageId, key: `post-images/${row.imageId}/original`, contentType, checksum: hash(body) },
        metadata: { imageId: row.imageId },
      };
    }
  };
  return writeObjects({
    entries: entries(),
    bucket,
    outputDir,
    filename: 'r2-import-manifest.json',
    kind: 'uploads',
    signal,
  });
};
export const importMigrationOgp = async ({ manifestPath, outputDir, bucket, generate, signal }) => {
  const entries = async function*() {
    for await (const row of await table(manifestPath, 'articles', signal)) {
      if (typeof row.title !== 'string' || row.title.length > 200 || !uuid.test(row.articleId ?? '')) {
        throw new Error('Invalid exported article.');
      }
      if (row.status !== 'published') continue;
      signal?.throwIfAborted();
      const body = await generate(row.title);
      signal?.throwIfAborted();
      if (
        !(body instanceof Uint8Array) || body.length > OBJECT_BYTES
        || !Buffer.from(body.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ) throw new Error('Invalid generated OGP.');
      yield {
        body,
        object: {
          articleId: row.articleId,
          key: `og/${row.articleId}.png`,
          contentType: 'image/png',
          checksum: hash(body),
        },
        metadata: { articleId: row.articleId },
      };
    }
  };
  return writeObjects({
    entries: entries(),
    bucket,
    outputDir,
    filename: 'ogp-import-manifest.json',
    kind: 'ogp',
    signal,
  });
};
