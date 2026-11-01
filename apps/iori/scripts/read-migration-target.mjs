import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withCliSignal } from './cli-lifetime.mjs';
import { runInfrastructureCommand } from './infrastructure-command.mjs';
import { assertExternalMigrationPath } from './migration-path-safety.mjs';
import { expectedTargetFromOutputs } from './migration-target-contract.mjs';
import { targetSetupConfiguration } from './migration-target-setup.mjs';
import { classifyTerraformFailure, readTargetFailureLine } from './read-target-diagnostics.mjs';
import { createTargetTerraform } from './target-terraform.mjs';
export const readMigrationTarget = async (env, signal, onStage = () => {}) => {
  onStage('config');
  const config = targetSetupConfiguration(env);
  onStage('path');
  const path = await assertExternalMigrationPath(env.IORI_MIGRATION_EXPECTED_TARGET_PATH);
  onStage('tf-setup');
  const privateDirectory = await mkdtemp(join(tmpdir(), 'iori-target-read-'));
  const runCommand = async (program, args, options) => {
    const command = args[1];
    onStage(`tf-${command}`);
    let stderr = '';
    try {
      const result = await runInfrastructureCommand(program, args, {
        ...options,
        inspectOutput: (output) => {
          stderr = output.stderr;
        },
      });
      if (command === 'output') onStage('output-check');
      return result;
    } catch (error) {
      if (error instanceof Error && error.diagnostic === undefined) {
        error.diagnostic = { reason: classifyTerraformFailure(stderr) };
      }
      throw error;
    }
  };
  const outputs = await createTargetTerraform({ ...config, privateDirectory, signal, runCommand })
    .initializeEstablished();
  onStage('expected');
  const target = expectedTargetFromOutputs({ ...config, outputs });
  onStage('write');
  await writeFile(path, JSON.stringify(target) + '\n', { flag: 'wx', mode: 0o600 });
  return target;
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let readStage = 'config';
  withCliSignal(signal =>
    readMigrationTarget(process.env, signal, (stage) => {
      readStage = stage;
    })
  ).then(() => console.log('Established target read complete.')).catch((error) => {
    try {
      console.error(readTargetFailureLine(readStage, error));
    } catch {}
    console.error('Established target read failed.');
    process.exitCode = 1;
  });
}
