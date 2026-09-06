import { runMigrationCommand } from './migration-command.mjs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseExpectedTarget, targetHash } from './migration-target-contract.mjs';
import { METADATA_BYTES, privateFileHash, privateHandle, readPrivateBounded } from './migration-file-stream.mjs';
import { APPLICATION_TABLE_ORDER } from './export-postgres-lib.mjs';
import { D1_STATEMENT_BYTES } from './convert-d1-import.mjs';
export const reviewedD1Schema = fileURLToPath(new URL('../drizzle-d1/0000_boring_xavin.sql', import.meta.url));

/** Every SQL file is fully checked before the first schema or data mutation. No automatic retries. */
export const importMigrationD1 = async (
  { expectedTarget, manifestPath, apiToken, signal, runCommand = runMigrationCommand, fetchRequest = fetch },
) => {
  const target = parseExpectedTarget(expectedTarget);
  if (!apiToken) throw new Error('D1 credential is required.');
  const manifest = JSON.parse(await readPrivateBounded(manifestPath, METADATA_BYTES, signal));
  const schema = await readFile(reviewedD1Schema);
  if (
    manifest.complete !== true || manifest.schemaChecksum !== targetHash(schema) || !Array.isArray(manifest.files)
    || Object.keys(manifest.tables ?? {}).length !== APPLICATION_TABLE_ORDER.length
    || APPLICATION_TABLE_ORDER.some((name) => !manifest.tables[name])
  ) throw new Error('Invalid converted D1 manifest.');
  const files = [];
  const names = new Set();
  for (const [index, descriptor] of manifest.files.entries()) {
    if (descriptor.file !== `d1-import-${String(index + 1).padStart(3, '0')}.sql` || names.has(descriptor.file)) {
      throw new Error('Invalid SQL file order.');
    }
    names.add(descriptor.file);
    const path = join(dirname(manifestPath), descriptor.file);
    if (await privateFileHash(path, signal) !== descriptor.checksum) throw new Error('SQL checksum mismatch.');
    const handle = await privateHandle(path);
    let statement = [];
    let quote = 0;
    try {
      for await (const chunk of handle.createReadStream({ autoClose: false, highWaterMark: 65536, signal })) {
        for (const byte of chunk) {
          if (!statement.length && [9, 10, 13, 32].includes(byte)) continue;
          statement.push(byte);
          if (statement.length > D1_STATEMENT_BYTES) throw new Error('D1 statement exceeds bound.');
          if (byte === quote) quote = 0;
          else if (!quote && [39, 34].includes(byte)) quote = byte;
          else if (!quote && byte === 59) {
            if (!Buffer.from(statement).toString().startsWith('INSERT INTO "')) {
              throw new Error('Invalid import statement.');
            }
            statement = [];
          }
        }
      }
      if (statement.length || quote) throw new Error('Truncated import SQL.');
    } finally {
      await handle.close();
    }
    files.push(path);
  }
  const directory = await mkdtemp(join(tmpdir(), 'iori-d1-import-'));
  const configPath = join(directory, 'wrangler.json');
  await writeFile(
    configPath,
    JSON.stringify({
      name: target.identity.worker_name,
      account_id: target.identity.account_id,
      compatibility_date: '2025-06-04',
      d1_databases: [{ binding: 'DB', database_name: target.resources.d1.name, database_id: target.resources.d1.id }],
    }),
    { mode: 0o600, flag: 'wx' },
  );
  let index = 0;
  const run = async (file) => {
    signal?.throwIfAborted();
    try {
      const result = await runCommand('pnpm', [
        'exec',
        'wrangler',
        'd1',
        'execute',
        'DB',
        '--remote',
        '--yes',
        '--config',
        configPath,
        '--file',
        file,
      ], {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        shell: false,
        signal,
        timeout: 300_000,
        maxBuffer: 8_000_000,
        env: {
          ...process.env,
          CLOUDFLARE_API_TOKEN: apiToken,
          CLOUDFLARE_ACCOUNT_ID: target.identity.account_id,
          WRANGLER_SEND_METRICS: 'false',
          WRANGLER_LOG_PATH: join(directory, 'wrangler.log'),
        },
      });
      await writeFile(join(directory, `command-${index++}.txt`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`, {
        mode: 0o600,
        flag: 'wx',
      });
    } catch {
      throw new Error('D1 import failed; outcome may be uncertain.');
    }
  };
  await run(reviewedD1Schema);
  for (const table of APPLICATION_TABLE_ORDER) {
    const response = await fetchRequest(
      `https://api.cloudflare.com/client/v4/accounts/${target.identity.account_id}/d1/database/${target.resources.d1.id}/query`,
      {
        method: 'POST',
        redirect: 'error',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
        headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: `SELECT COUNT(*) AS count FROM "${table}"`, params: [] }),
      },
    );
    if (!response.ok || !response.body) throw new Error('D1 empty-target check failed.');
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.length;
        if (bytes > 65536) throw new Error('D1 read exceeds bound.');
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel();
    }
    const value = JSON.parse(Buffer.concat(chunks).toString());
    if (
      value.success !== true || value.result?.length !== 1 || value.result[0].success !== true
      || value.result[0].results?.length !== 1 || value.result[0].results[0].count !== 0
    ) throw new Error('D1 application tables must be empty.');
  }
  for (const file of files) await run(file);
  return { fileCount: files.length };
};
