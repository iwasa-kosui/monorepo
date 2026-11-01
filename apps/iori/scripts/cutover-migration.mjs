import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import { withCliSignal } from './cli-lifetime.mjs';
import { cutoverFailureLines } from './cutover-diagnostics.mjs';
import { admissionEnvironment, expectedTargetFromOutputs } from './migration-target-contract.mjs';
import { targetSetupConfiguration } from './migration-target-setup.mjs';
import { restoreAndVerifyMigration } from './restore-and-verify-migration.mjs';
import { assertReviewedMain } from './reviewed-main.mjs';
import { smokeReviewedTarget } from './reviewed-smoke.mjs';
import { assertSmokeQueueToken, isAllSmokeServiceUnavailable } from './smoke-diagnostics.mjs';
import { createSourceSshAdapter } from './source-control-ssh.mjs';
import { validateSourceState } from './source-transfer-protocol.mjs';
import { createTargetControlPlane } from './target-control-plane.mjs';
import { withReason } from './target-preparation-diagnostics.mjs';
import { createTargetTerraform } from './target-terraform.mjs';
import { transitionWorkerAdmission } from './transition-worker-admission.mjs';
import { workflowTimeBudget } from './workflow-context.mjs';

const SMOKE_RETRY_WAITS_MS = [10_000, 20_000, 30_000];
const SMOKE_RETRY_WINDOW_MS = 120_000;
const smokeWithRetry = async (run, { sleep, report, now, signal }) => {
  const startedAt = now();
  for (let attempt = 1;; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const wait = SMOKE_RETRY_WAITS_MS[attempt - 1];
      if (
        wait === undefined || !isAllSmokeServiceUnavailable(error?.diagnostic?.details)
        || now() - startedAt + wait > SMOKE_RETRY_WINDOW_MS
      ) throw error;
      report(
        `IORI_DIAG stage=cutover-smoke-worker program=none exit=none signal=none reason=smoke-retry-${attempt}-all-503`,
      );
      await sleep(wait, signal);
    }
  }
};
export const cutoverMigration = async ({ env, startedAt, signal }, {
  restore = restoreAndVerifyMigration,
  setup = targetSetupConfiguration,
  checkMain = assertReviewedMain,
  sourceFactory = createSourceSshAdapter,
  terraformFactory = createTargetTerraform,
  controlFactory = createTargetControlPlane,
  transition = transitionWorkerAdmission,
  smoke = smokeReviewedTarget,
  sleep = (ms, signal) => delay(ms, undefined, { signal }),
  report = (line) => process.stderr.write(`${line}\n`),
  now = () => Date.now(),
  onStage = () => {},
} = {}) => {
  onStage('inputs');
  const config = setup(env);
  const budget = workflowTimeBudget(startedAt);
  assertSmokeQueueToken(env.IORI_SMOKE_QUEUE_TOKEN);
  signal = AbortSignal.any([signal, AbortSignal.timeout(budget.remainingMs)]);
  const verification = new AbortController();
  const timer = setTimeout(() => verification.abort(), budget.verificationMs);
  let verified;
  try {
    onStage('main-check');
    await checkMain(config.mainSha, { signal });
    onStage('restore');
    verified = await restore({ env, signal: AbortSignal.any([signal, verification.signal]) });
    verification.signal.throwIfAborted();
  } finally {
    clearTimeout(timer);
  }
  // The fresh restore/actual verification and the following version chain share this process and job.
  const { target, record, resources } = verified;
  workflowTimeBudget(startedAt);
  onStage('tf-init');
  const terraform = terraformFactory({
    ...config,
    privateDirectory: join(env.IORI_PRIVATE_DIRECTORY, 'state'),
    signal,
    onStage,
  });
  const outputs = await terraform.initializeEstablished();
  onStage('target-check');
  if (!isDeepStrictEqual(expectedTargetFromOutputs({ ...config, outputs }), target)) {
    throw withReason(new Error('Cutover target mismatch.'), 'mismatch');
  }
  onStage('source');
  const source = await sourceFactory({
    host: env.IORI_SOURCE_SSH_HOST,
    user: env.IORI_SOURCE_SSH_USER,
    identityFile: env.IORI_SOURCE_SSH_IDENTITY_FILE,
    knownHostsFile: env.IORI_SOURCE_SSH_KNOWN_HOSTS_FILE,
    mainSha: config.mainSha,
    runId: config.runId,
  });
  const gate = async (stage) => {
    onStage(stage);
    signal.throwIfAborted();
    await checkMain(config.mainSha, { signal });
    const currentResources = await control.readResources({ ...resources, consumerAttached: true });
    if (currentResources.consumerId !== target.resources.consumer.id) {
      throw withReason(new Error('Cutover consumer mismatch.'), 'mismatch');
    }
    const state = validateSourceState(await source.status(signal));
    if (
      !state.drained || state.identity?.main_sha !== config.mainSha || state.identity?.run_id !== config.runId
      || state.source_revision !== config.mainSha
    ) throw withReason(new Error('Source quiescence is unavailable.'), 'source-not-quiescent');
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
  await gate('gate-smoke');
  onStage('to-smoke');
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
  onStage('smoke-worker');
  await smokeWithRetry(
    () => smoke({ target, hostname: target.admission.workerHostname, token: env.IORI_SMOKE_QUEUE_TOKEN, signal }),
    { sleep, report, now, signal },
  );
  await gate('gate-route');
  onStage('read-smoke');
  await read();
  await terraform.changeRoute({ establishedBindings: outputs.workerBindings });
  routePresent = true;
  onStage('read-route');
  await read();
  onStage('smoke-canonical');
  await smoke({ target, hostname: target.admission.hostname, token: env.IORI_SMOKE_QUEUE_TOKEN, signal });
  await gate('gate-active');
  onStage('to-active');
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
  await gate('gate-queue');
  onStage('read-active');
  await read();
  await terraform.changeQueuePause({ paused: false, establishedBindings: outputs.workerBindings, routeEnabled: true });
  onStage('read-resume');
  const active = await control.readActiveResources({
    d1Id: resources.d1Id,
    kvId: resources.kvId,
    queueId: resources.queueId,
    dlqId: resources.dlqId,
    consumerAttached: true,
  });
  if (active.consumerId !== target.resources.consumer.id) {
    throw withReason(new Error('Activated consumer mismatch.'), 'mismatch');
  }
  await control.readActiveWorker({
    resources: active,
    admissionEnvironment: environment(),
    zoneId: config.zoneId,
    expectedVersionId: versionId,
    routePresent: true,
  });
  onStage('smoke-final');
  await smoke({ target, hostname: target.admission.hostname, token: env.IORI_SMOKE_QUEUE_TOKEN, signal });
  signal.throwIfAborted();
  return { activated: true };
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let cutoverStage = 'inputs';
  let cutoverSignal;
  withCliSignal(signal => {
    cutoverSignal = signal;
    return cutoverMigration({ env: process.env, startedAt: Number(process.env.IORI_JOB_STARTED_AT), signal }, {
      onStage: (stage) => {
        cutoverStage = stage;
      },
    });
  }).then(() => console.log('Reviewed cutover completed.')).catch((error) => {
    try {
      process.stderr.write(`${cutoverFailureLines(cutoverStage, error, cutoverSignal?.aborted === true).join('\n')}\n`);
    } catch {}
    console.error('Cutover failed; retain source freeze and current destination state for reviewed recovery.');
    process.exitCode = 1;
  });
}
