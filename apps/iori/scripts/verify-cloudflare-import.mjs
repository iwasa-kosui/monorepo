import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalD1RowString } from './data-migration-mapping.mjs';
import { APPLICATION_TABLE_ORDER } from './export-postgres.mjs';
import { assertExternalMigrationPath } from './migration-path-safety.mjs';

const objectMap = (objects, keys) =>
  new Map((objects ?? keys?.map((key) => ({ key })) ?? []).map((object) => [object.key, object]));
const MAX_LIST_PAGE_KEYS = 1_000;
const MAX_LISTED_OBJECT_KEYS = 100_000;
const MAX_LIST_PAGES = 100_000;

const mismatchCount = (expectedObjects, actualObjects) => {
  const expectedMap = objectMap(expectedObjects);
  const actualMap = objectMap(actualObjects);
  const expectedMismatches = [...expectedMap.values()].filter((expected) => {
    const actual = actualMap.get(expected.key);
    return actual === undefined
      || actual.missing === true
      || (expected.checksum !== undefined && expected.checksum !== actual.checksum)
      || (expected.contentType !== undefined && expected.contentType !== actual.contentType);
  }).length;
  const unexpected = [...actualMap.keys()].filter((key) => !expectedMap.has(key)).length;
  return expectedMismatches + unexpected;
};

export const verifyCloudflareImport = ({ expected, actual }) => {
  const failures = [];
  const tableNames = new Set([...Object.keys(expected.tables ?? {}), ...Object.keys(actual.tables ?? {})]);
  for (const table of [...tableNames].sort()) {
    const expectedTable = expected.tables?.[table] ?? { count: 0, checksum: undefined };
    const actualTable = actual.tables?.[table] ?? { count: 0, checksum: undefined };
    if (expectedTable.count !== actualTable.count) {
      failures.push(`table=${table} expected=${expectedTable.count} actual=${actualTable.count}`);
    }
    if (expectedTable.checksum !== actualTable.checksum) failures.push(`table=${table} checksum=mismatch`);
  }
  const r2Missing = expected.r2Objects === undefined
    ? (() => {
      const expectedMap = objectMap(undefined, expected.r2Keys);
      const actualMap = objectMap(actual.r2Objects, actual.r2Keys);
      return [...expectedMap.keys()].filter((key) => !actualMap.has(key)).length
        + [...actualMap.keys()].filter((key) => !expectedMap.has(key)).length;
    })()
    : mismatchCount(expected.r2Objects, actual.r2Objects);
  if (r2Missing > 0) failures.push(`r2=missing count=${r2Missing}`);
  const ogpMissing = expected.ogpObjects === undefined
    ? (() => {
      const expectedMap = objectMap(undefined, expected.ogpKeys);
      const actualMap = objectMap(actual.ogpObjects, actual.ogpKeys);
      return [...expectedMap.keys()].filter((key) => !actualMap.has(key)).length
        + [...actualMap.keys()].filter((key) => !expectedMap.has(key)).length;
    })()
    : mismatchCount(expected.ogpObjects, actual.ogpObjects);
  if (ogpMissing > 0) failures.push(`ogp=missing count=${ogpMissing}`);
  return failures;
};

const assertCompleteTableManifest = (manifest, name, { requireFiles = false } = {}) => {
  const tables = manifest?.tables;
  if (manifest?.complete !== true || tables === undefined || typeof tables !== 'object') {
    throw new Error(`${name} is incomplete.`);
  }
  if (
    Object.keys(tables).length !== APPLICATION_TABLE_ORDER.length
    || APPLICATION_TABLE_ORDER.some((table) => !Object.hasOwn(tables, table))
  ) {
    throw new Error(`${name} does not contain the complete application table set.`);
  }
  for (const table of APPLICATION_TABLE_ORDER) {
    const value = tables[table];
    if (
      value === null
      || typeof value !== 'object'
      || !Number.isSafeInteger(value.count)
      || value.count < 0
      || typeof value.checksum !== 'string'
      || !/^[0-9a-f]{64}$/i.test(value.checksum)
      || (requireFiles && (typeof value.file !== 'string' || !/^[a-zA-Z0-9._-]+\.ndjson$/.test(value.file)))
    ) {
      throw new Error(`${name} table=${table} metadata is invalid.`);
    }
  }
  return tables;
};

const fileChecksum = async (path) => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
};

const validateExportTable = async ({ exportManifestPath, table, exportTable, d1Table, onRow }) => {
  const path = resolve(dirname(exportManifestPath), exportTable.file);
  if ((await lstat(path)).isSymbolicLink()) throw new Error(`Export source file is a symlink for table ${table}.`);
  if (await fileChecksum(path) !== exportTable.checksum) {
    throw new Error(`Export checksum mismatch for table ${table}.`);
  }
  const input = createReadStream(path, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  const canonicalChecksum = createHash('sha256');
  let count = 0;
  let previousCanonical;
  for await (const line of lines) {
    if (line.length === 0) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      throw new Error(`Export row is invalid for table ${table}.`);
    }
    const canonical = canonicalD1RowString(table, row);
    if (previousCanonical !== undefined && canonical < previousCanonical) {
      throw new Error(`Export rows are not in canonical order for table ${table}.`);
    }
    previousCanonical = canonical;
    canonicalChecksum.update(`${canonical}\n`);
    count += 1;
    onRow?.(row);
  }
  if (count !== exportTable.count) throw new Error(`Export row count mismatch for table ${table}.`);
  if (count !== d1Table.count) throw new Error(`D1 table count mismatch for table ${table}.`);
  if (canonicalChecksum.digest('hex') !== d1Table.checksum) {
    throw new Error(`D1 canonical checksum mismatch for table ${table}.`);
  }
};

export const createManifestExpectedProvider = ({
  exportManifestPath,
  d1ImportManifestPath,
  uploadManifestPath,
  ogpManifestPath,
}) => ({
  loadExpected: async () => {
    if (d1ImportManifestPath === undefined) throw new Error('D1 import manifest is required.');
    await assertExternalMigrationPath(exportManifestPath);
    await Promise.all(
      [d1ImportManifestPath, uploadManifestPath, ogpManifestPath].filter(Boolean).map(assertExternalMigrationPath),
    );
    const [exportManifest, d1ImportManifest] = await Promise.all([
      readFile(exportManifestPath, 'utf8').then(JSON.parse),
      readFile(d1ImportManifestPath, 'utf8').then(JSON.parse),
    ]);
    const exportTables = assertCompleteTableManifest(exportManifest, 'Export manifest', { requireFiles: true });
    const d1Tables = assertCompleteTableManifest(d1ImportManifest, 'D1 import manifest');
    const expectedUploadKeys = new Set();
    const expectedOgpKeys = new Set();
    let publishedArticleCount = 0;
    for (const table of APPLICATION_TABLE_ORDER) {
      await validateExportTable({
        exportManifestPath,
        table,
        exportTable: exportTables[table],
        d1Table: d1Tables[table],
        onRow: table === 'post_images'
          ? (row) => {
            if (typeof row.imageId !== 'string' || row.imageId.length === 0) {
              throw new Error('Post image export row has an invalid identifier.');
            }
            expectedUploadKeys.add(`post-images/${row.imageId}/original`);
          }
          : table === 'articles'
          ? (row) => {
            if (row.status !== 'published') return;
            if (typeof row.articleId !== 'string' || row.articleId.length === 0) {
              throw new Error('Published article export row has an invalid identifier.');
            }
            expectedOgpKeys.add(`og/${row.articleId}.png`);
            publishedArticleCount += 1;
          }
          : undefined,
      });
    }
    const tables = Object.fromEntries(
      APPLICATION_TABLE_ORDER.map((table) => [table, {
        count: d1Tables[table].count,
        checksum: d1Tables[table].checksum,
      }]),
    );
    const expectedUploads = exportTables.post_images.count;
    if (expectedUploads > 0 && uploadManifestPath === undefined) {
      throw new Error('R2 upload manifest is required for exported post images.');
    }
    const uploads = uploadManifestPath === undefined
      ? []
      : JSON.parse(await readFile(uploadManifestPath, 'utf8')).objects ?? [];
    if (!Array.isArray(uploads)) throw new Error('R2 upload manifest objects are invalid.');
    if (uploads.length !== expectedUploads) throw new Error('R2 upload manifest is incomplete.');
    if (new Set(uploads.map((object) => object?.key)).size !== uploads.length) {
      throw new Error('R2 upload manifest contains duplicate keys.');
    }
    if (
      uploads.some((object) =>
        typeof object?.key !== 'string'
        || typeof object.checksum !== 'string'
        || !/^[0-9a-f]{64}$/i.test(object.checksum)
        || typeof object.contentType !== 'string'
        || object.contentType.length === 0
      )
    ) {
      throw new Error('R2 upload manifest object metadata is incomplete.');
    }
    if (expectedUploadKeys.size !== expectedUploads) {
      throw new Error('Post image export contains duplicate identifiers.');
    }
    if (uploads.some((object) => !expectedUploadKeys.has(object.key))) {
      throw new Error('R2 upload manifest contains an unexpected object.');
    }
    if (publishedArticleCount > 0 && ogpManifestPath === undefined) {
      throw new Error('OGP manifest is required for published articles.');
    }
    const ogpFromManifest = ogpManifestPath === undefined
      ? []
      : JSON.parse(await readFile(ogpManifestPath, 'utf8')).objects ?? [];
    if (!Array.isArray(ogpFromManifest)) throw new Error('OGP manifest objects are invalid.');
    if (ogpFromManifest.length !== publishedArticleCount) throw new Error('OGP manifest is incomplete.');
    if (expectedOgpKeys.size !== publishedArticleCount) {
      throw new Error('Published article export contains duplicate identifiers.');
    }
    if (new Set(ogpFromManifest.map((object) => object?.key)).size !== ogpFromManifest.length) {
      throw new Error('OGP manifest contains duplicate keys.');
    }
    if (
      ogpFromManifest.some((object) =>
        typeof object?.key !== 'string'
        || typeof object.checksum !== 'string'
        || !/^[0-9a-f]{64}$/i.test(object.checksum)
        || typeof object.contentType !== 'string'
        || object.contentType.length === 0
      )
    ) {
      throw new Error('OGP manifest object metadata is incomplete.');
    }
    if (
      ogpFromManifest.some((object) => !expectedOgpKeys.has(object.key) || object.contentType !== 'image/png')
    ) {
      throw new Error('OGP manifest contains an unexpected object.');
    }
    const ogpObjects = ogpFromManifest;
    return { tables, r2Objects: uploads, ogpObjects };
  },
});

/**
 * @typedef {Uint8Array | {arrayBuffer(): Promise<ArrayBuffer>} | {getReader(): ReadableStreamDefaultReader<Uint8Array>}} R2Body
 * @typedef {{body: R2Body, httpMetadata?: {contentType?: string}}} R2Object
 */

/**
 * @param {{d1: {getTableSummaries: (tables: string[]) => Promise<Record<string, {count: number, checksum: string}>>}, r2: {get: (key: string) => Promise<R2Object | null>, listObjects: (prefix: string, cursor?: string) => Promise<{keys: readonly string[], cursor?: string}>}}} deps
 */
export const createCloudflareActualProvider = ({ d1, r2 }) => ({
  loadActual: async (expected) => {
    const checksumBody = async (body) => {
      const hash = createHash('sha256');
      if (body instanceof Uint8Array) {
        hash.update(body);
        return hash.digest('hex');
      }
      if (typeof body?.getReader === 'function') {
        const reader = body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          hash.update(value);
        }
        return hash.digest('hex');
      }
      if (typeof body?.arrayBuffer === 'function') {
        hash.update(new Uint8Array(await body.arrayBuffer()));
        return hash.digest('hex');
      }
      throw new Error('R2 object body is not readable.');
    };
    const objectFor = async (expectedObject) => {
      const object = await r2.get(expectedObject.key);
      if (object === null) return { key: expectedObject.key, missing: true };
      return {
        key: expectedObject.key,
        checksum: await checksumBody(object.body),
        contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
      };
    };
    const listExtraObjects = async (prefix, expectedObjects) => {
      if (typeof r2.listObjects !== 'function') throw new Error('R2 object listing is unavailable.');
      const expectedKeySet = new Set(expectedObjects.map((object) => object.key));
      const expectedSidecarKeySet = new Set(expectedObjects.map((object) => `${object.key}.metadata.json`));
      const listedKeySet = new Set();
      const cursorSet = new Set();
      const extraObjects = [];
      let cursor;
      let pageCount = 0;
      while (true) {
        pageCount += 1;
        if (pageCount > MAX_LIST_PAGES) throw new Error('R2 object listing exceeds the bounded page limit.');
        const page = await r2.listObjects(prefix, cursor);
        if (
          page === null
          || typeof page !== 'object'
          || !Array.isArray(page.keys)
          || page.keys.length > MAX_LIST_PAGE_KEYS
          || page.keys.some((key) => typeof key !== 'string' || !key.startsWith(prefix))
          || (page.cursor !== undefined && typeof page.cursor !== 'string')
        ) {
          throw new Error('R2 object listing is invalid.');
        }
        for (const key of page.keys) {
          if (listedKeySet.has(key)) throw new Error('R2 object listing contains duplicate keys.');
          if (listedKeySet.size >= MAX_LISTED_OBJECT_KEYS) {
            throw new Error('R2 object listing exceeds the bounded verification limit.');
          }
          listedKeySet.add(key);
          if (!expectedKeySet.has(key) && !expectedSidecarKeySet.has(key)) extraObjects.push({ key });
        }
        if (page.cursor === undefined) break;
        if (cursorSet.has(page.cursor)) throw new Error('R2 object listing cursor did not advance.');
        cursorSet.add(page.cursor);
        cursor = page.cursor;
      }
      return extraObjects;
    };
    const mapWithConcurrency = async (objects) => {
      const results = new Array(objects.length);
      let nextIndex = 0;
      const worker = async () => {
        while (true) {
          const index = nextIndex;
          nextIndex += 1;
          if (index >= objects.length) return;
          results[index] = await objectFor(objects[index]);
        }
      };
      const workerCount = Math.min(4, objects.length);
      await Promise.all(Array.from({ length: workerCount }, worker));
      return results;
    };
    const tables = await d1.getTableSummaries(Object.keys(expected.tables));
    const expectedR2Objects = expected.r2Objects ?? [];
    const expectedOgpObjects = expected.ogpObjects ?? [];
    const r2Objects = [
      ...(await mapWithConcurrency(expectedR2Objects)),
      ...(await listExtraObjects('post-images/', expectedR2Objects)),
    ];
    const ogpObjects = [
      ...(await mapWithConcurrency(expectedOgpObjects)),
      ...(await listExtraObjects('og/', expectedOgpObjects)),
    ];
    return { tables, r2Objects, ogpObjects };
  },
});

/**
 * Repository-owned provider contract. Production runners supply only these two
 * functions; tests inject fakes and no Cloudflare connection is made here.
 */
export const createCloudflareImportProvider = ({ getTableSummaries, getObject, listObjects }) =>
  createCloudflareActualProvider({
    d1: { getTableSummaries },
    r2: { get: getObject, listObjects },
  });

export const verifyCloudflareImportWithProviders = async ({ expectedProvider, actualProvider }) => {
  const expected = await expectedProvider.loadExpected();
  const actual = await actualProvider.loadActual(expected);
  return verifyCloudflareImport({ expected, actual });
};

export const runVerificationCli = async ({ expectedProvider, actualProvider, write = console.error }) => {
  const failures = await verifyCloudflareImportWithProviders({ expectedProvider, actualProvider });
  for (const failure of failures) write(failure);
  return failures.length === 0 ? 0 : 1;
};

const main = async () => {
  const exportManifestPath = process.env.IORI_EXPORT_MANIFEST;
  const d1ImportManifestPath = process.env.IORI_D1_IMPORT_MANIFEST;
  const runnerPath = process.env.IORI_IMPORT_RUNNER;
  if (exportManifestPath === undefined || runnerPath === undefined) {
    throw new Error('Export manifest and import runner are required.');
  }
  await assertExternalMigrationPath(runnerPath);
  const expectedProvider = createManifestExpectedProvider({
    exportManifestPath,
    d1ImportManifestPath,
    uploadManifestPath: process.env.IORI_R2_IMPORT_MANIFEST,
    ogpManifestPath: process.env.IORI_OGP_IMPORT_MANIFEST,
  });
  const { getObject, getTableSummaries, listObjects } = await import(pathToFileURL(runnerPath).href);
  const actualProvider = createCloudflareImportProvider({ getObject, getTableSummaries, listObjects });
  process.exitCode = await runVerificationCli({ expectedProvider, actualProvider });
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('Cloudflare import verification failed.');
    process.exitCode = 1;
  });
}
