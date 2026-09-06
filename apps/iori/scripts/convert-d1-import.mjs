import { METADATA_BYTES, privateFileHash, privateLines, readPrivateBounded } from './migration-file-stream.mjs';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalD1RowString, d1ColumnForSourceColumn, normalizeD1Value } from './data-migration-mapping.mjs';
import { APPLICATION_TABLE_ORDER } from './export-postgres-lib.mjs';
import { assertExternalMigrationPath, prepareExternalMigrationDirectory } from './migration-path-safety.mjs';

const MAX_WRANGLER_IMPORT_BYTES = 32 * 1024 * 1024;
export const D1_STATEMENT_BYTES = 100_000;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const quoteIdentifier = (identifier) => `"${identifier.replaceAll('"', '""')}"`;

const sqlValue = (value) => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replaceAll('\'', '\'\'')}'`;
};

const insertStatement = (table, row) => {
  const columns = Object.keys(row).sort();
  const values = columns.map((column) => sqlValue(normalizeD1Value({ table, column, value: row[column] })));
  const d1Columns = columns.map((column) => quoteIdentifier(d1ColumnForSourceColumn(table, column)));
  return `INSERT INTO ${quoteIdentifier(table)} (${d1Columns.join(', ')}) VALUES (${values.join(', ')});\n`;
};

const waitForWrite = (stream, value) =>
  new Promise((resolveWrite, rejectWrite) => {
    const onError = (error) => {
      stream.off('error', onError);
      rejectWrite(error);
    };
    stream.once('error', onError);
    if (stream.write(value)) {
      stream.off('error', onError);
      resolveWrite();
      return;
    }
    stream.once('drain', () => {
      stream.off('error', onError);
      resolveWrite();
    });
  });

const closeWriter = async (writer) => {
  if (writer.failure) writer.stream.destroy();
  else writer.stream.end();
  await writer.closed;
  if (writer.failure) throw writer.failure;
};

const sourcePath = (manifestPath, file) => resolve(dirname(manifestPath), file);

const validateSourceTable = async ({ manifestPath, table, source, signal }) => {
  if (!Number.isSafeInteger(source?.count) || source.count < 0) {
    throw new Error(`Export manifest count is invalid for table ${table}.`);
  }
  if (typeof source?.file !== 'string' || !/^[a-zA-Z0-9._-]+\.ndjson$/.test(source.file)) {
    throw new Error(`Export manifest file is invalid for table ${table}.`);
  }
  if (typeof source.checksum !== 'string' || !/^[0-9a-f]{64}$/i.test(source.checksum)) {
    throw new Error(`Export manifest checksum is invalid for table ${table}.`);
  }
  const path = sourcePath(manifestPath, source.file);
  if ((await lstat(path)).isSymbolicLink()) throw new Error(`Export source file is a symlink for table ${table}.`);
  const actualChecksum = await privateFileHash(path, signal);
  if (actualChecksum !== source.checksum) throw new Error(`Export checksum mismatch for table ${table}.`);

  const lines = privateLines(path, { signal });
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
    count += 1;
  }
  if (count !== source.count) throw new Error(`Export row count mismatch for table ${table}.`);
  return path;
};

export const convertD1Import = async (
  { manifestPath, schemaPath, outputDir, maxFileBytes = MAX_WRANGLER_IMPORT_BYTES, signal },
) => {
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes <= 0 || maxFileBytes > MAX_WRANGLER_IMPORT_BYTES) {
    throw new Error('The D1 SQL size limit must be a positive integer.');
  }
  await assertExternalMigrationPath(manifestPath);
  const outputDirectory = await prepareExternalMigrationDirectory(outputDir);
  const [manifestText, schemaText] = await Promise.all([
    readPrivateBounded(manifestPath, METADATA_BYTES, signal),
    readFile(schemaPath, 'utf8'),
  ]);
  if (!schemaText.includes('CREATE TABLE')) throw new Error('The SQLite/D1 schema is invalid.');
  const manifest = JSON.parse(manifestText);
  const sourceTables = manifest.tables ?? {};
  if (manifest.complete !== true) throw new Error('Export manifest is incomplete.');
  if (
    Object.keys(sourceTables).length !== APPLICATION_TABLE_ORDER.length
    || APPLICATION_TABLE_ORDER.some((table) => !Object.hasOwn(sourceTables, table))
  ) {
    throw new Error('Export manifest does not contain the complete application table set.');
  }
  for (const table of APPLICATION_TABLE_ORDER) {
    await validateSourceTable({ manifestPath, table, source: sourceTables[table], signal });
  }

  const files = [];
  const manifestFiles = [];
  const transformedTables = {};
  let writer;
  const openWriter = () => {
    const file = `d1-import-${String(files.length + 1).padStart(3, '0')}.sql`;
    const path = resolve(outputDirectory, file);
    writer = {
      path,
      file,
      bytes: 0,
      hash: createHash('sha256'),
      tables: new Set(),
      stream: createWriteStream(path, { flags: 'wx', mode: 0o600 }),
    };
    const opened = writer;
    opened.failure = undefined;
    opened.closed = new Promise((resolveClosed) => opened.stream.once('close', resolveClosed));
    opened.stream.on('error', (error) => {
      opened.failure ??= error;
    });
    files.push(path);
  };
  const finishWriter = async () => {
    if (writer === undefined) return;
    await closeWriter(writer);
    if (manifestFiles.length >= 100_000) throw new Error('Too many SQL chunks.');
    manifestFiles.push({ file: writer.file, checksum: writer.hash.digest('hex'), tables: [...writer.tables] });
    writer = undefined;
  };

  try {
    for (const table of APPLICATION_TABLE_ORDER) {
      const source = sourceTables[table];
      if (source === undefined) continue;
      const lines = privateLines(sourcePath(manifestPath, source.file), { signal });
      const transformedChecksum = createHash('sha256');
      let transformedCount = 0;
      let previousCanonical;
      for await (const line of lines) {
        if (line.length === 0) continue;
        const row = JSON.parse(line);
        const canonicalRow = canonicalD1RowString(table, row);
        if (previousCanonical !== undefined && canonicalRow < previousCanonical) {
          throw new Error(`Export rows are not in canonical order for table ${table}.`);
        }
        previousCanonical = canonicalRow;
        transformedChecksum.update(`${canonicalRow}\n`);
        transformedCount += 1;
        const sql = insertStatement(table, row);
        const bytes = Buffer.byteLength(sql);
        if (bytes > D1_STATEMENT_BYTES) throw new Error('A SQL statement exceeds the D1 100000-byte limit.');
        if (bytes > maxFileBytes) throw new Error('A SQL row exceeds the D1 import size limit.');
        if (writer !== undefined && writer.bytes + bytes > maxFileBytes) await finishWriter();
        if (writer === undefined) openWriter();
        if (writer.failure) throw writer.failure;
        await waitForWrite(writer.stream, sql);
        if (writer.failure) throw writer.failure;
        writer.bytes += bytes;
        writer.hash.update(sql);
        writer.tables.add(table);
      }
      transformedTables[table] = { count: transformedCount, checksum: transformedChecksum.digest('hex') };
    }
    await finishWriter();
  } catch (error) {
    if (writer !== undefined) {
      writer.stream.destroy();
      await writer.closed;
    }
    throw error;
  }

  if (
    Buffer.byteLength(JSON.stringify({ tables: transformedTables, files: manifestFiles }, null, 2)) + 1024
      > METADATA_BYTES
  ) throw new Error('D1 manifest exceeds metadata bound.');
  await writeFile(
    resolve(outputDirectory, 'd1-import-manifest.json'),
    `${
      JSON.stringify(
        {
          schemaVersion: manifest.schemaVersion,
          complete: true,
          schemaChecksum: sha256(schemaText),
          tables: transformedTables,
          files: manifestFiles,
        },
        null,
        2,
      )
    }\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
  return files;
};

const main = async () => {
  const manifestPath = process.env.IORI_EXPORT_MANIFEST;
  const outputDir = process.env.IORI_MIGRATION_OUTPUT_DIR;
  const schemaPath = process.env.IORI_D1_SCHEMA ?? resolve(scriptDirectory, '../drizzle-d1/0000_boring_xavin.sql');
  if (manifestPath === undefined || outputDir === undefined) {
    throw new Error('Required migration environment is missing.');
  }
  await convertD1Import({ manifestPath, schemaPath, outputDir });
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('D1 conversion failed.');
    process.exitCode = 1;
  });
}
