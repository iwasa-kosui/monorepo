import { deployReviewedWorkerVersion } from './deploy-reviewed-worker-version.mjs';
import { runInfrastructureCommand } from './infrastructure-command.mjs';
import { createTargetControlPlane } from './target-control-plane.mjs';

/** Caller owns signed verification/main/run/authorization checks. This only permits reviewed mode changes with actual before/after readback. */
export const transitionWorkerAdmission = async (
  {
    identity,
    resources,
    token,
    admissionEnvironment,
    zoneId,
    expectedVersionId,
    mode,
    routePresent = false,
    fetchRequest,
    runCommand = runInfrastructureCommand,
    signal = AbortSignal.timeout(15 * 60_000),
  },
) => {
  const from = admissionEnvironment.IORI_ADMISSION_MODE;
  if (!['sealed:smoke', 'smoke:active', 'active:sealed', 'smoke:sealed'].includes(`${from}:${mode}`)) {
    throw new Error('Admission transition is invalid.');
  }
  signal.throwIfAborted();
  const control = createTargetControlPlane({ identity, token, fetchRequest, signal });
  await control.readWorkerAdmission({ resources, admissionEnvironment, zoneId, expectedVersionId, routePresent });
  await control.readQueuePause({ queueId: resources.queueId, paused: true });
  const versionId = await deployReviewedWorkerVersion({
    identity,
    resources,
    admissionEnvironment,
    mode,
    signal,
    runCommand,
  });
  return control.readWorkerAdmission({
    resources,
    admissionEnvironment: { ...admissionEnvironment, IORI_ADMISSION_MODE: mode },
    zoneId,
    expectedVersionId: versionId,
    routePresent,
  });
};
