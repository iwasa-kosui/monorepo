import { isDeepStrictEqual } from 'node:util';

import { deployReviewedWorkerVersion } from './deploy-reviewed-worker-version.mjs';
import { admissionEnvironment, parseExpectedTarget, targetIdentity } from './migration-target-contract.mjs';
import { assertReviewedMain } from './reviewed-main.mjs';
import { createTargetControlPlane } from './target-control-plane.mjs';

/** A normal code update preserves the immutable migration identity and all active routing/Queue configuration. */
export const updateActiveWorker = async (
  {
    expectedTarget,
    currentCodeSha,
    token,
    zoneId,
    signal,
    fetchRequest,
    runCommand,
    checkMain = assertReviewedMain,
    onStage = () => {},
  },
) => {
  const target = parseExpectedTarget(expectedTarget, { backend: false });
  if (!/^[a-f0-9]{40}$/.test(currentCodeSha ?? '')) throw new Error('Invalid reviewed code revision.');
  signal.throwIfAborted();
  await checkMain(currentCodeSha, { signal });
  const identity = targetIdentity(target);
  const control = createTargetControlPlane({ identity, token, signal, fetchRequest });
  const r = target.resources;
  const ids = { d1Id: r.d1.id, kvId: r.kv.id, queueId: r.queue.id, dlqId: r.dlq.id, consumerAttached: true };
  const environment = { ...admissionEnvironment(target), IORI_ADMISSION_MODE: 'active' };
  const before = await control.readActiveResources(ids);
  if (before.consumerId !== r.consumer.id) {
    throw Object.assign(new Error('Active consumer mismatch.'), {
      diagnostic: { reason: 'state-mismatch', details: ['resource-consumer-id'] },
    });
  }
  const previousVersion = await control.readCurrentVersion();
  const beforeWorker = await control.readActiveWorker({
    resources: before,
    admissionEnvironment: environment,
    zoneId,
    expectedVersionId: previousVersion,
    routePresent: true,
  });
  await checkMain(currentCodeSha, { signal });
  onStage('deploy-worker-deploy');
  const versionId = await deployReviewedWorkerVersion({
    identity,
    resources: before,
    admissionEnvironment: environment,
    mode: 'active',
    signal,
    runCommand,
    migrateD1: true,
    onStage,
  });
  onStage('deploy-worker-after');
  const after = await control.readActiveResources(ids);
  if (!isDeepStrictEqual(before, after)) throw new Error('Active Queue configuration changed; retain current state.');
  const afterWorker = await control.readActiveWorker({
    resources: after,
    admissionEnvironment: environment,
    zoneId,
    expectedVersionId: versionId,
    routePresent: true,
  });
  if (!isDeepStrictEqual(beforeWorker.routeConfiguration, afterWorker.routeConfiguration)) {
    throw new Error('Active route configuration changed; retain current state.');
  }
  signal.throwIfAborted();
  return { currentCodeSha, migrationMainSha: target.identity.main_sha, previousVersion, versionId };
};
