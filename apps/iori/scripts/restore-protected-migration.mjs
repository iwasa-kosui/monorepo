import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withCliSignal } from './cli-lifetime.mjs';
import { restoreAndVerifyMigration } from './restore-and-verify-migration.mjs';
import { operationFailureLines } from './target-preparation-diagnostics.mjs';
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  withCliSignal(signal => restoreAndVerifyMigration({ env: process.env, signal })).then(() =>
    console.log('Fresh restored migration verification passed.')
  ).catch((error) => {
    try {
      process.stderr.write(`${operationFailureLines('verify-import', error).join('\n')}\n`);
    } catch {}
    console.error('Fresh migration verification failed.');
    process.exitCode = 1;
  });
}
