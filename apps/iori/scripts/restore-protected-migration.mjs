import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withCliSignal } from './cli-lifetime.mjs';
import { restoreAndVerifyMigration } from './restore-and-verify-migration.mjs';
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  withCliSignal(signal => restoreAndVerifyMigration({ env: process.env, signal })).then(() =>
    console.log('Fresh restored migration verification passed.')
  ).catch(() => {
    console.error('Fresh migration verification failed.');
    process.exitCode = 1;
  });
}
