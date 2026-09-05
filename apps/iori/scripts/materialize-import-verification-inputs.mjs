import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const manifestNames = {
  exportManifestPath: 'export-manifest.json',
  d1ImportManifestPath: 'd1-import-manifest.json',
  r2ImportManifestPath: 'r2-import-manifest.json',
  ogpImportManifestPath: 'ogp-import-manifest.json',
  importRunnerPath: 'import-runner.mjs',
};

const safeRelativePath = (path) =>
  typeof path === 'string'
  && path.length > 0
  && !path.startsWith('/')
  && path.split('/').every((part) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part) && part !== '.' && part !== '..');

const parseJson = (source, message) => {
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(message);
  }
};

const writePrivateFile = async (path, contents, mode) => {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, contents, { mode });
  await chmod(path, mode);
};

const dataFileReferences = (exportManifest) =>
  Object.values(exportManifest?.tables ?? {})
    .flatMap((table) => typeof table?.file === 'string' ? [table.file] : []);

const assertCompleteOgpImport = ({ exportManifest, dataFiles, ogpImportManifestJson }) => {
  const articlesFile = exportManifest?.tables?.articles?.file;
  if (typeof articlesFile !== 'string' || typeof dataFiles[articlesFile] !== 'string') {
    throw new Error('Protected OGP import manifest is incomplete.');
  }
  const articles = dataFiles[articlesFile].split(/\r?\n/).filter(Boolean).map((row) =>
    parseJson(row, 'Protected OGP import manifest is incomplete.')
  );
  const published = articles.filter((article) => article?.status === 'published');
  const manifest = parseJson(ogpImportManifestJson, 'Protected OGP import manifest is invalid.');
  const objects = manifest?.objects;
  const expectedKeys = new Set(
    published.map((article) => typeof article.articleId === 'string' ? `og/${article.articleId}.png` : ''),
  );
  const actualKeys = new Set((objects instanceof Array ? objects : []).map((object) => object?.key));
  if (
    published.some((article) => typeof article.articleId !== 'string' || article.articleId.length === 0)
    || !(objects instanceof Array)
    || objects.length !== expectedKeys.size
    || actualKeys.size !== expectedKeys.size
    || [...expectedKeys].some((key) => !actualKeys.has(key))
    || objects.some((object) =>
      typeof object?.key !== 'string'
      || !expectedKeys.has(object.key)
      || object.contentType !== 'image/png'
      || typeof object.checksum !== 'string'
      || object.checksum.length === 0
    )
  ) {
    throw new Error('Protected OGP import manifest is incomplete.');
  }
};

/**
 * Materializes the entire protected import-verification contract outside the repository.
 *
 * @param {{
 *   directory: string,
 *   exportManifestJson: string,
 *   d1ImportManifestJson: string,
 *   r2ImportManifestJson: string,
 *   ogpImportManifestJson: string,
 *   exportDataFilesJson: string,
 *   importRunnerSource: string,
 * }} input
 */
export const materializeImportVerificationInputs = async (input) => {
  const exportManifest = parseJson(input.exportManifestJson, 'Protected export manifest is invalid.');
  const dataFiles = parseJson(input.exportDataFilesJson, 'Protected export data-file contract is invalid.');
  if (dataFiles === null || typeof dataFiles !== 'object' || Array.isArray(dataFiles)) {
    throw new Error('Protected export data-file contract is invalid.');
  }
  const references = dataFileReferences(exportManifest);
  const reserved = new Set(Object.values(manifestNames));
  if (
    references.some((path) => !safeRelativePath(path) || reserved.has(path) || typeof dataFiles[path] !== 'string')
    || Object.entries(dataFiles).some(([path, contents]) =>
      !safeRelativePath(path) || reserved.has(path) || typeof contents !== 'string'
    )
    || typeof input.importRunnerSource !== 'string'
    || input.importRunnerSource.length === 0
  ) {
    throw new Error('Protected export data-file contract is incomplete.');
  }
  assertCompleteOgpImport({ exportManifest, dataFiles, ogpImportManifestJson: input.ogpImportManifestJson });

  const directory = resolve(input.directory);
  const paths = Object.fromEntries(Object.entries(manifestNames).map(([key, name]) => [key, join(directory, name)]));
  await Promise.all([
    writePrivateFile(paths.exportManifestPath, input.exportManifestJson, 0o600),
    writePrivateFile(paths.d1ImportManifestPath, input.d1ImportManifestJson, 0o600),
    writePrivateFile(paths.r2ImportManifestPath, input.r2ImportManifestJson, 0o600),
    writePrivateFile(paths.ogpImportManifestPath, input.ogpImportManifestJson, 0o600),
    writePrivateFile(paths.importRunnerPath, input.importRunnerSource, 0o700),
    ...Object.entries(dataFiles).map(([path, contents]) => writePrivateFile(join(directory, path), contents, 0o600)),
  ]);
  return paths;
};

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [flag, directory] = process.argv.slice(2);
  if (flag !== '--directory' || directory === undefined || process.argv.length !== 4) {
    throw new Error('Usage: materialize-import-verification-inputs.mjs --directory <private-directory>');
  }
  await materializeImportVerificationInputs({
    directory,
    exportManifestJson: process.env.IORI_EXPORT_MANIFEST_JSON ?? '',
    d1ImportManifestJson: process.env.IORI_D1_IMPORT_MANIFEST_JSON ?? '',
    r2ImportManifestJson: process.env.IORI_R2_IMPORT_MANIFEST_JSON ?? '',
    ogpImportManifestJson: process.env.IORI_OGP_IMPORT_MANIFEST_JSON ?? '',
    exportDataFilesJson: process.env.IORI_EXPORT_DATA_FILES_JSON ?? '',
    importRunnerSource: process.env.IORI_IMPORT_RUNNER_SOURCE ?? '',
  });
}
