import {
  admissionEnvironment,
  parseExpectedTarget,
  parsePreparationRecord,
  serializePreparationRecord,
  targetIdentity,
} from './migration-target-contract.mjs';
import { createTargetControlPlane } from './target-control-plane.mjs';
export const readSealedMigrationTarget = async ({ expectedTarget, record, token, zoneId, fetchRequest, signal }) => {
  const target = parseExpectedTarget(expectedTarget);
  parsePreparationRecord(serializePreparationRecord(record), target);
  if (!/^[a-f0-9]{32}$/.test(zoneId ?? '') || !token) throw new Error('Target readback configuration is required.');
  const control = createTargetControlPlane({ identity: targetIdentity(target), token, fetchRequest, signal });
  const r = target.resources;
  const resources = await control.readResources({
    d1Id: r.d1.id,
    kvId: r.kv.id,
    queueId: r.queue.id,
    dlqId: r.dlq.id,
    consumerAttached: true,
  });
  if (resources.consumerId !== r.consumer.id) throw new Error('Prepared consumer mismatch.');
  const worker = await control.readSealedWorker({
    resources,
    admissionEnvironment: admissionEnvironment(target),
    zoneId,
    expectedVersionId: record.observed.worker_version_id,
  });
  return { resources, worker };
};
