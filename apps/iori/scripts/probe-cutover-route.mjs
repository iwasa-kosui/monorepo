import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import { withCliSignal } from './cli-lifetime.mjs';
import { probeFailureLines, ProbeRestoreFailure } from './cutover-diagnostics.mjs';
import {
  admissionEnvironment,
  expectedTargetFromOutputs,
  rehearsalTargetKey,
  targetIdentity,
} from './migration-target-contract.mjs';
import { loadExpectedTarget } from './migration-target-input.mjs';
import { targetSetupConfiguration, transferStorageFromEnvironment } from './migration-target-setup.mjs';
import { readSealedMigrationTarget } from './read-sealed-migration-target.mjs';
import { smokeReviewedTarget } from './reviewed-smoke.mjs';
import { createTargetControlPlane } from './target-control-plane.mjs';
import { withReason } from './target-preparation-diagnostics.mjs';
import { readPreparationRecord } from './target-preparation-record.mjs';
import { createTargetTerraform } from './target-terraform.mjs';
import { transitionWorkerAdmission } from './transition-worker-admission.mjs';
import { workflowTimeBudget } from './workflow-context.mjs';

const RESTORE_TIMEOUT_MS = 15 * 60_000;

export const probeCutoverRoute = async ({ env, startedAt, signal }, {
  setup = targetSetupConfiguration,
  loadTarget = loadExpectedTarget,
  storageFactory = transferStorageFromEnvironment,
  readRecord = readPreparationRecord,
  readSealed = readSealedMigrationTarget,
  readVersion = ({ target, token, signal }) =>
    createTargetControlPlane({ identity: targetIdentity(target), token, signal }).readCurrentVersion(),
  terraformFactory = createTargetTerraform,
  transition = transitionWorkerAdmission,
  smoke = smokeReviewedTarget,
  onStage = () => {},
} = {}) => {
  onStage('inputs');
  const config = setup(env);
  const budget = workflowTimeBudget(startedAt);
  signal = AbortSignal.any([signal, AbortSignal.timeout(budget.remainingMs)]);
  const target = await loadTarget(env.IORI_MIGRATION_EXPECTED_TARGET_PATH);
  if (config.mainSha !== target.identity.main_sha || config.runId !== target.identity.run_id) {
    throw withReason(new Error('Invocation mismatch.'), 'mismatch');
  }
  onStage('rehearsal-gate');
  const storage = storageFactory(env, targetIdentity(target), true, signal);
  if (await storage.getIfExists(rehearsalTargetKey(target), 65536) === null) {
    throw withReason(new Error('Target generation was not used for rehearsal.'), 'rehearsal-missing');
  }
  onStage('tf-init');
  const { initializeEstablished, planRoute, planQueueResume } = terraformFactory({
    ...config,
    privateDirectory: join(env.IORI_PRIVATE_DIRECTORY, 'state'),
    signal,
    onStage,
  });
  const outputs = await initializeEstablished();
  onStage('read-sealed');
  if (!isDeepStrictEqual(expectedTargetFromOutputs({ ...config, outputs }), target)) {
    throw withReason(new Error('Probe target mismatch.'), 'mismatch');
  }
  const { record } = await readRecord({ storage, expectedTarget: target });
  let versionId = await readVersion({ target, token: config.token, signal });
  const { resources } = await readSealed({
    expectedTarget: target,
    record,
    expectedVersionId: versionId,
    token: config.token,
    zoneId: config.zoneId,
    signal,
  });
  await planRoute({ establishedBindings: outputs.workerBindings });
  await planQueueResume({ establishedBindings: outputs.workerBindings });
  let mode = 'sealed';
  const environment = () => ({ ...admissionEnvironment(target), IORI_ADMISSION_MODE: mode });
  const move = async (next, moveSignal = signal) => {
    const moved = await transition({
      ...config,
      resources,
      admissionEnvironment: environment(),
      expectedVersionId: versionId,
      mode: next,
      routePresent: false,
      signal: moveSignal,
    });
    versionId = moved.versionId;
    mode = next;
  };
  const returnToSealed = async (failure, failedStage, restoreSignal) => {
    onStage('to-sealed');
    try {
      await move('sealed', restoreSignal);
    } catch (restoreFailure) {
      throw new ProbeRestoreFailure(failure, failedStage, restoreFailure);
    }
    onStage(failedStage);
    throw failure;
  };
  onStage('to-smoke');
  try {
    await move('smoke');
  } catch (toSmokeFailure) {
    const restoreSignal = AbortSignal.timeout(RESTORE_TIMEOUT_MS);
    let deployedVersionId;
    try {
      deployedVersionId = await readVersion({ target, token: config.token, signal: restoreSignal });
    } catch {
      throw toSmokeFailure;
    }
    if (deployedVersionId === versionId) throw toSmokeFailure;
    versionId = deployedVersionId;
    mode = 'smoke';
    await returnToSealed(toSmokeFailure, 'to-smoke', restoreSignal);
  }
  onStage('smoke-worker');
  try {
    await smoke({ target, hostname: target.admission.workerHostname, token: env.IORI_SMOKE_QUEUE_TOKEN, signal });
  } catch (smokeFailure) {
    await returnToSealed(smokeFailure, 'smoke-worker', AbortSignal.timeout(RESTORE_TIMEOUT_MS));
  }
  onStage('to-sealed');
  await move('sealed', AbortSignal.timeout(RESTORE_TIMEOUT_MS));
  onStage('read-final');
  await readSealed({
    expectedTarget: target,
    record,
    expectedVersionId: versionId,
    token: config.token,
    zoneId: config.zoneId,
    signal,
  });
  signal.throwIfAborted();
  return { probed: true };
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let probeStage = 'inputs';
  let probeSignal;
  withCliSignal(signal => {
    probeSignal = signal;
    return probeCutoverRoute({ env: process.env, startedAt: Number(process.env.IORI_JOB_STARTED_AT), signal }, {
      onStage: (stage) => {
        probeStage = stage;
      },
    });
  }).then(() => console.log('Cutover route probe completed.')).catch((error) => {
    try {
      process.stderr.write(`${probeFailureLines(probeStage, error, probeSignal?.aborted === true).join('\n')}\n`);
    } catch {}
    console.error('Cutover route probe failed; confirm the Worker admission mode of the measurement generation.');
    process.exitCode = 1;
  });
}
