import { fileURLToPath } from 'node:url';

import { withCliSignal } from './cli-lifetime.mjs';
import { runMigrationCommand } from './migration-command.mjs';
// Fixed synthetic SQLite/S3/PG/renderer fixture. No provider paths or live credential input.
withCliSignal(async signal => {
  await runMigrationCommand('pnpm', [
    '--filter',
    'iori',
    'exec',
    'vitest',
    'run',
    'scripts/__tests__/migrationExecutor.test.ts',
    '-t',
    'executes real export/conversion/SQL/S3/OGP/signatures and restores all files for fresh verification',
  ], {
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
    env: process.env,
    signal,
    timeout: 120000,
    maxBuffer: 8_000_000,
    killGraceMs: 15000,
  });
  console.log('Credential-free migration fixture passed.');
}, { timeoutMs: 150000 }).catch(() => {
  console.error('Credential-free migration fixture failed.');
  process.exitCode = 1;
});
