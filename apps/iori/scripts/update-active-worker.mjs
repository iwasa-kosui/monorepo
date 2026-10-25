import { isDeepStrictEqual } from 'node:util';

import { deployReviewedWorkerVersion } from './deploy-reviewed-worker-version.mjs';
import { admissionEnvironment, parseExpectedTarget, targetIdentity } from './migration-target-contract.mjs';
import { assertReviewedMain } from './reviewed-main.mjs';
import { createTargetControlPlane } from './target-control-plane.mjs';
import { readPreparationRecord } from './target-preparation-record.mjs';

/** A normal code update preserves the immutable migration identity and all active routing/Queue configuration. */
export const updateActiveWorker = async (
  {
    expectedTarget,
    currentCodeSha,
    storage,
    token,
    zoneId,
    signal,
    fetchRequest,
    runCommand,
    checkMain = assertReviewedMain,
  },
) => {
  const target = parseExpectedTarget(expectedTarget);
  if (!/^[a-f0-9]{40}$/.test(currentCodeSha ?? '')) throw new Error('Invalid reviewed code revision.');
  signal.throwIfAborted();
  await checkMain(currentCodeSha, { signal });
  // This checks the immutable record only; it does not rewrite it or recompare historic live data counts.
  await readPreparationRecord({ storage, expectedTarget: target });
  const identity = targetIdentity(target);
  const control = createTargetControlPlane({ identity, token, signal, fetchRequest });
  const r = target.resources;
  const ids = { d1Id: r.d1.id, kvId: r.kv.id, queueId: r.queue.id, dlqId: r.dlq.id, consumerAttached: true };
  const environment = { ...admissionEnvironment(target), IORI_ADMISSION_MODE: 'active' };
  const before = await control.readActiveResources(ids);
  if (before.consumerId !== r.consumer.id) throw new Error('Active consumer mismatch.');
  const previousVersion = await control.readCurrentVersion();
  const beforeWorker = await control.readActiveWorker({
    resources: before,
    admissionEnvironment: environment,
    zoneId,
    expectedVersionId: previousVersion,
    routePresent: true,
  });
  await checkMain(currentCodeSha, { signal });
  const versionId = await deployReviewedWorkerVersion({
    identity,
    resources: before,
    admissionEnvironment: environment,
    mode: 'active',
    signal,
    runCommand,
  });
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
