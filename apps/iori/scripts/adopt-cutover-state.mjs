import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import { adoptFailureLines, adoptResultLine } from './adopt-diagnostics.mjs';
import { withCliSignal } from './cli-lifetime.mjs';
import { activeTargetFromOutputs } from './migration-target-contract.mjs';
import { targetSetupConfiguration } from './migration-target-setup.mjs';
import { assertReviewedMain } from './reviewed-main.mjs';
import { createTargetControlPlane } from './target-control-plane.mjs';
import { withReason } from './target-preparation-diagnostics.mjs';
import { createTargetTerraform } from './target-terraform.mjs';
import { parseWorkflowInvocation, workflowTimeBudget } from './workflow-context.mjs';

export const adoptCutoverState = async ({ env, startedAt, signal }, {
  setup = targetSetupConfiguration,
  checkMain = assertReviewedMain,
  terraformFactory = createTargetTerraform,
  controlFactory = createTargetControlPlane,
  report = (line) => process.stderr.write(`${line}\n`),
  onStage = () => {},
} = {}) => {
  onStage('adopt-inputs');
  const invocation = parseWorkflowInvocation(env);
  if (invocation.operation !== 'adopt-cutover-state') {
    throw withReason(new Error('Invalid adopt operation.'), 'config-invalid');
  }
  const config = setup({ ...env, MAIN_SHA: invocation.migrationSha });
  if (
    config.mainSha !== invocation.migrationSha || config.runId !== invocation.runId
    || config.identity.generation !== invocation.generation || config.identity.environment !== invocation.environment
  ) throw withReason(new Error('Adopt identity mismatch.'), 'config-invalid');
  signal = AbortSignal.any([signal, AbortSignal.timeout(workflowTimeBudget(startedAt).remainingMs)]);
  onStage('adopt-main-check');
  await checkMain(invocation.codeSha, { signal });
  onStage('adopt-tf-init');
  let finalCheck = false;
  const terraform = terraformFactory({
    ...config,
    privateDirectory: join(env.IORI_PRIVATE_DIRECTORY, 'state'),
    signal,
    onStage: (stage) => {
      if (!finalCheck) onStage(stage === 'tf-init' ? 'adopt-tf-init' : stage);
    },
    onNotice: (stage, word) => report(adoptResultLine(stage, word)),
  });
  const state = await terraform.initializeAdoptable();
  onStage('adopt-cloud-read');
  const control = controlFactory({ identity: config.identity, token: config.token, signal });
  const environment = { ...config.admissionEnvironment, IORI_ADMISSION_MODE: 'active' };
  const stateTarget = state.targetIdentity;
  const readCloud = async () => {
    const resources = await control.readActiveResources({
      d1Id: state.workerBindings.d1_database_id,
      kvId: state.workerBindings.kv_namespace_id,
      queueId: stateTarget.queue_id,
      dlqId: stateTarget.dlq_id,
      consumerAttached: true,
    });
    if (resources.consumerId !== stateTarget.consumer[0].consumer_id) {
      throw Object.assign(new Error('Active consumer mismatch.'), {
        diagnostic: { reason: 'state-mismatch', details: ['resource-consumer-id'] },
      });
    }
    const versionId = await control.readCurrentVersion();
    const worker = await control.readActiveWorker({
      resources,
      admissionEnvironment: environment,
      zoneId: config.zoneId,
      expectedVersionId: versionId,
      routePresent: true,
    });
    return { resources, versionId, worker };
  };
  const before = await readCloud();
  const routes = before.worker.routeConfiguration;
  const routeId = routes?.length === 1 ? routes[0]?.id : undefined;
  if (!/^[a-f0-9]{32}$/.test(routeId ?? '')) {
    throw withReason(new Error('Route id is invalid.'), 'route-id-invalid');
  }
  await terraform.adoptCutoverState({
    routeId,
    routeInState: state.routeInState,
    establishedBindings: state.workerBindings,
  });
  finalCheck = true;
  onStage('adopt-final-check');
  const after = await terraform.initializeAdoptable({ paused: false });
  try {
    activeTargetFromOutputs({ ...config, outputs: after });
  } catch (error) {
    throw withReason(error, 'mismatch');
  }
  if (!after.routeInState || after.routeId !== routeId) {
    throw withReason(new Error('Adopted route mismatch.'), 'mismatch');
  }
  onStage('adopt-cloud-reread');
  if (!isDeepStrictEqual(await readCloud(), before)) {
    throw withReason(new Error('Cloudflare state changed during adoption.'), 'mismatch');
  }
  report(adoptResultLine('adopt-cloud-reread', 'adopted'));
  signal.throwIfAborted();
  return { adopted: true };
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let adoptStage = 'adopt-inputs';
  let adoptSignal;
  withCliSignal(signal => {
    adoptSignal = signal;
    return adoptCutoverState({ env: process.env, startedAt: Number(process.env.IORI_JOB_STARTED_AT), signal }, {
      onStage: (stage) => {
        adoptStage = stage;
      },
    });
  }).then(() => console.log('Reviewed cutover state adoption completed.')).catch((error) => {
    try {
      process.stderr.write(`${adoptFailureLines(adoptStage, error, adoptSignal?.aborted === true).join('\n')}\n`);
    } catch {}
    console.error('Cutover state adoption failed; retain current state for reviewed recovery.');
    process.exitCode = 1;
  });
}
