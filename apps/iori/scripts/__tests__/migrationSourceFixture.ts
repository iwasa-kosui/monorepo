import { createHash } from 'node:crypto';
import { mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APPLICATION_TABLE_ORDER } from '../export-postgres.mjs';
export const migrationSourceFixture = async (rows: Record<string, unknown[]> = {}) => {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'iori-actual-import-'));
  const tables: Record<string, { file: string; count: number; checksum: string }> = {};
  for (const table of APPLICATION_TABLE_ORDER) {
    const body = (rows[table] ?? []).map(row => JSON.stringify(row) + '\n').join('');
    tables[table] = {
      file: `${table}.ndjson`,
      count: rows[table]?.length ?? 0,
      checksum: createHash('sha256').update(body).digest('hex'),
    };
    await writeFile(join(root, tables[table].file), body, { mode: 0o600 });
  }
  const manifestPath = join(root, 'export-manifest.json');
  await writeFile(
    manifestPath,
    JSON.stringify({ schemaVersion: 1, complete: true, exportedAt: '2026-09-06T00:00:00Z', tables }),
    { mode: 0o600 },
  );
  return { root, manifestPath };
};
