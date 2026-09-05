import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import { withCliSignal } from './cli-lifetime.mjs';
import { admissionEnvironment, expectedTargetFromOutputs } from './migration-target-contract.mjs';
import { targetSetupConfiguration } from './migration-target-setup.mjs';
import { restoreAndVerifyMigration } from './restore-and-verify-migration.mjs';
import { assertReviewedMain } from './reviewed-main.mjs';
import { smokeReviewedTarget } from './reviewed-smoke.mjs';
import { createSourceSshAdapter } from './source-control-ssh.mjs';
import { validateSourceState } from './source-transfer-protocol.mjs';
import { createTargetControlPlane } from './target-control-plane.mjs';
import { createTargetTerraform } from './target-terraform.mjs';
import { transitionWorkerAdmission } from './transition-worker-admission.mjs';
import { workflowTimeBudget } from './workflow-context.mjs';

export const cutoverMigration = async ({ env, startedAt, signal }, {
  restore = restoreAndVerifyMigration,
  setup = targetSetupConfiguration,
  checkMain = assertReviewedMain,
  sourceFactory = createSourceSshAdapter,
  terraformFactory = createTargetTerraform,
  controlFactory = createTargetControlPlane,
  transition = transitionWorkerAdmission,
  smoke = smokeReviewedTarget,
} = {}) => {
  const config = setup(env);
  const budget = workflowTimeBudget(startedAt);
  signal = AbortSignal.any([signal, AbortSignal.timeout(budget.remainingMs)]);
  const verification = new AbortController();
  const timer = setTimeout(() => verification.abort(), budget.verificationMs);
  let verified;
  try {
    await checkMain(config.mainSha, { signal });
    verified = await restore({ env, signal: AbortSignal.any([signal, verification.signal]) });
    verification.signal.throwIfAborted();
  } finally {
    clearTimeout(timer);
  }
  // The fresh restore/actual verification and the following version chain share this process and job.
  const { target, record, resources } = verified;
  workflowTimeBudget(startedAt);
  const terraform = terraformFactory({
    ...config,
    privateDirectory: join(env.IORI_PRIVATE_DIRECTORY, 'state'),
    signal,
  });
  const outputs = await terraform.initializeEstablished();
  if (!isDeepStrictEqual(expectedTargetFromOutputs({ ...config, outputs }), target)) {
    throw new Error('Cutover target mismatch.');
  }
  const source = await sourceFactory({
    host: env.IORI_SOURCE_SSH_HOST,
    user: env.IORI_SOURCE_SSH_USER,
    identityFile: env.IORI_SOURCE_SSH_IDENTITY_FILE,
    knownHostsFile: env.IORI_SOURCE_SSH_KNOWN_HOSTS_FILE,
    mainSha: config.mainSha,
    runId: config.runId,
  });
  const gate = async () => {
    signal.throwIfAborted();
    await checkMain(config.mainSha, { signal });
    const currentResources = await control.readResources({ ...resources, consumerAttached: true });
    if (currentResources.consumerId !== target.resources.consumer.id) throw new Error('Cutover consumer mismatch.');
    const state = validateSourceState(await source.status(signal));
    if (
      !state.drained || state.identity?.main_sha !== config.mainSha || state.identity?.run_id !== config.runId
      || state.source_revision !== config.mainSha
    ) throw new Error('Source quiescence is unavailable.');
  };
  const control = controlFactory({ identity: config.identity, token: config.token, signal });
  let versionId = record.observed.worker_version_id;
  let mode = 'sealed';
  let routePresent = false;
  const environment = () => ({ ...admissionEnvironment(target), IORI_ADMISSION_MODE: mode });
  const read = () =>
    control.readWorkerAdmission({
      resources,
      admissionEnvironment: environment(),
      zoneId: config.zoneId,
      expectedVersionId: versionId,
      routePresent,
    });
  await gate();
  const smokeVersion = await transition({
    ...config,
    resources,
    admissionEnvironment: environment(),
    expectedVersionId: versionId,
    mode: 'smoke',
    routePresent,
    signal,
  });
  versionId = smokeVersion.versionId;
  mode = 'smoke';
  await smoke({ target, hostname: target.admission.workerHostname, token: env.IORI_SMOKE_QUEUE_TOKEN, signal });
  await gate();
  await read();
  await terraform.changeRoute({ establishedBindings: outputs.workerBindings });
  routePresent = true;
  await read();
  await gate();
  const activeVersion = await transition({
    ...config,
    resources,
    admissionEnvironment: environment(),
    expectedVersionId: versionId,
    mode: 'active',
    routePresent,
    signal,
  });
  versionId = activeVersion.versionId;
  mode = 'active';
  await gate();
  await read();
  await terraform.changeQueuePause({ paused: false, establishedBindings: outputs.workerBindings, routeEnabled: true });
  const active = await control.readActiveResources({
    d1Id: resources.d1Id,
    kvId: resources.kvId,
    queueId: resources.queueId,
    dlqId: resources.dlqId,
    consumerAttached: true,
  });
  if (active.consumerId !== target.resources.consumer.id) throw new Error('Activated consumer mismatch.');
  await control.readActiveWorker({
    resources: active,
    admissionEnvironment: environment(),
    zoneId: config.zoneId,
    expectedVersionId: versionId,
    routePresent: true,
  });
  await smoke({ target, hostname: target.admission.hostname, token: env.IORI_SMOKE_QUEUE_TOKEN, signal });
  signal.throwIfAborted();
  return { activated: true };
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  withCliSignal(signal =>
    cutoverMigration({ env: process.env, startedAt: Number(process.env.IORI_JOB_STARTED_AT), signal })
  ).then(() => console.log('Reviewed cutover completed.')).catch(() => {
    console.error('Cutover failed; retain source freeze and current destination state for reviewed recovery.');
    process.exitCode = 1;
  });
}
