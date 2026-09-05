import { createTargetIdentity } from './fresh-target.mjs';
import { createTargetControlPlane } from './target-control-plane.mjs';
import { createTargetTerraform } from './target-terraform.mjs';

/** Separate protected target preparation precedes executor reservation. This owns no source export, import, signing, or receipt phases. */
export const createTargetPreparation = (options) => {
  const identity = createTargetIdentity(options.identity);
  const control = createTargetControlPlane({
    identity,
    token: options.token,
    fetchRequest: options.fetchRequest,
    signal: options.signal,
  });
  const terraform = createTargetTerraform({ ...options, identity });
  let resources;
  let outputs;
  let started = false;
  const prepareResources = async () => {
    if (started) throw new Error('Target preparation is single-use.');
    started = true;
    await control.assertFresh();
    await terraform.initializeFresh();
    outputs = await terraform.prepare('resources');
    resources = await control.readResources({
      d1Id: outputs.workerBindings.d1_database_id,
      kvId: outputs.workerBindings.kv_namespace_id,
      queueId: outputs.targetIdentity.queue_id,
      dlqId: outputs.targetIdentity.dlq_id,
    });
    return {
      ...outputs,
      resources,
      summary: { freshGeneration: true, storageResources: 4, queues: 2, queuePaused: true, consumerCount: 0 },
    };
  };
  const attachSealedConsumer = async ({ admissionEnvironment, zoneId, expectedVersionId }) => {
    if (!resources || !outputs) throw new Error('Target resources have not been established.');
    const worker = await control.readSealedWorker({ resources, admissionEnvironment, zoneId, expectedVersionId });
    outputs = await terraform.prepare('consumer', { establishedBindings: outputs.workerBindings });
    resources = await control.readResources({ ...resources, consumerAttached: true });
    return { ...outputs, resources, worker, summary: { queuePaused: true, consumerCount: 1, sealedWorker: true } };
  };
  return Object.freeze({ prepareResources, attachSealedConsumer });
};
