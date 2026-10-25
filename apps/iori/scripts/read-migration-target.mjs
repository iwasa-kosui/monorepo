import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withCliSignal } from './cli-lifetime.mjs';
import { assertExternalMigrationPath } from './migration-path-safety.mjs';
import { expectedTargetFromOutputs } from './migration-target-contract.mjs';
import { targetSetupConfiguration } from './migration-target-setup.mjs';
import { createTargetTerraform } from './target-terraform.mjs';
export const readMigrationTarget = async (env, signal) => {
  const config = targetSetupConfiguration(env);
  const path = await assertExternalMigrationPath(env.IORI_MIGRATION_EXPECTED_TARGET_PATH);
  const privateDirectory = await mkdtemp(join(tmpdir(), 'iori-target-read-'));
  const outputs = await createTargetTerraform({ ...config, privateDirectory, signal }).initializeEstablished();
  const target = expectedTargetFromOutputs({ ...config, outputs });
  await writeFile(path, JSON.stringify(target) + '\n', { flag: 'wx', mode: 0o600 });
  return target;
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  withCliSignal(signal => readMigrationTarget(process.env, signal)).then(() =>
    console.log('Established target read complete.')
  ).catch(() => {
    console.error('Established target read failed.');
    process.exitCode = 1;
  });
}
