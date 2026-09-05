import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import { withCliSignal } from './cli-lifetime.mjs';
import { activeTargetFromOutputs } from './migration-target-contract.mjs';
import { targetSetupConfiguration, transferStorageFromEnvironment } from './migration-target-setup.mjs';
import { assertReviewedMain } from './reviewed-main.mjs';
import { createTargetTerraform } from './target-terraform.mjs';
import { updateActiveWorker } from './update-active-worker.mjs';
import { parseWorkflowInvocation, workflowTimeBudget } from './workflow-context.mjs';
const main = async (cliSignal) => {
  const invocation = parseWorkflowInvocation(process.env);
  if (invocation.operation !== 'deploy-worker') throw new Error('Invalid normal deployment operation.');
  const { remainingMs } = workflowTimeBudget(Number(process.env.IORI_JOB_STARTED_AT));
  const signal = AbortSignal.any([cliSignal, AbortSignal.timeout(remainingMs)]);
  const env = { ...process.env, MAIN_SHA: invocation.migrationSha };
  const config = targetSetupConfiguration(env);
  await assertReviewedMain(invocation.codeSha, { signal });
  const terraform = createTargetTerraform({
    ...config,
    privateDirectory: join(env.IORI_PRIVATE_DIRECTORY, 'state'),
    signal,
  });
  const outputs = await terraform.initializeActive();
  const target = activeTargetFromOutputs({ ...config, outputs });
  const path = join(env.IORI_PRIVATE_DIRECTORY, 'config/active-worker-bindings.json');
  await writeFile(path, JSON.stringify(outputs.workerBindings), { flag: 'wx', mode: 0o600 });
  process.env.IORI_WORKER_BINDINGS_PATH = path;
  process.env.IORI_REQUIRE_TERRAFORM_BINDINGS = 'true';
  await updateActiveWorker({
    expectedTarget: target,
    currentCodeSha: invocation.codeSha,
    storage: transferStorageFromEnvironment(env, config.identity, true, signal),
    token: config.token,
    zoneId: config.zoneId,
    signal,
  });
  const after = await terraform.initializeActive();
  if (
    !isDeepStrictEqual(outputs, after)
    || !isDeepStrictEqual(activeTargetFromOutputs({ ...config, outputs: after }), target)
  ) throw new Error('Active backend state changed; retain current state.');
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  withCliSignal(main).then(() => console.log('Reviewed active Worker update completed.')).catch(() => {
    console.error('Active Worker update failed; retain current state for reviewed recovery.');
    process.exitCode = 1;
  });
}
