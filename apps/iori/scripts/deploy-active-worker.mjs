import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withCliSignal } from './cli-lifetime.mjs';
import { activeTargetFromResolvedIds } from './migration-target-contract.mjs';
import { targetSetupConfiguration } from './migration-target-setup.mjs';
import { assertReviewedMain } from './reviewed-main.mjs';
import { operationFailureLines } from './operation-diagnostics.mjs';
import { createTargetControlPlane } from './target-control-plane.mjs';
import { updateActiveWorker } from './update-active-worker.mjs';
import { parseWorkflowInvocation, workflowTimeBudget } from './workflow-context.mjs';
const main = async (cliSignal, onStage) => {
  const invocation = parseWorkflowInvocation(process.env);
  if (invocation.operation !== 'deploy-worker') throw new Error('Invalid normal deployment operation.');
  const { remainingMs } = workflowTimeBudget(Number(process.env.IORI_JOB_STARTED_AT));
  const signal = AbortSignal.any([cliSignal, AbortSignal.timeout(remainingMs)]);
  const env = { ...process.env, MAIN_SHA: invocation.migrationSha };
  const config = targetSetupConfiguration(env);
  await assertReviewedMain(invocation.codeSha, { signal });
  onStage('deploy-worker-resolve');
  const resolved = await createTargetControlPlane({ identity: config.identity, token: config.token, signal })
    .resolveActiveResources();
  onStage('deploy-worker-before');
  const target = activeTargetFromResolvedIds({ ...config, resolved });
  const path = join(env.IORI_PRIVATE_DIRECTORY, 'config/active-worker-bindings.json');
  await writeFile(
    path,
    JSON.stringify({
      d1_database_id: resolved.d1Id,
      kv_namespace_id: resolved.kvId,
      r2_bucket_name: config.identity.names.uploads,
      queue_name: config.identity.names.queue,
      worker_name: config.identity.workerName,
    }),
    { flag: 'wx', mode: 0o600 },
  );
  process.env.IORI_WORKER_BINDINGS_PATH = path;
  process.env.IORI_REQUIRE_TERRAFORM_BINDINGS = 'true';
  await updateActiveWorker({
    expectedTarget: target,
    currentCodeSha: invocation.codeSha,
    token: config.token,
    zoneId: config.zoneId,
    signal,
    onStage,
  });
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let deployStage = 'deploy-worker-before';
  withCliSignal(signal =>
    main(signal, (stage) => {
      deployStage = stage;
    })
  ).then(() => console.log('Reviewed active Worker update completed.')).catch((error) => {
    try {
      process.stderr.write(`${operationFailureLines(deployStage, error).join('\n')}\n`);
    } catch {}
    console.error('Active Worker update failed; retain current state for reviewed recovery.');
    process.exitCode = 1;
  });
}
