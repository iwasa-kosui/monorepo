import { expect, it, vi } from 'vitest';
import { prepareMigrationTarget } from '../prepare-migration-target.mjs';
import { admissionEnvironment, expectedTargetFromOutputs, targetIdentity } from '../migration-target-contract.mjs';
import { expectedTargetFixture } from './migrationTargetFixture.js';
const fixture = () => {
  const target = expectedTargetFixture();
  const identity = targetIdentity(target);
  const config = {
    identity,
    mainSha: target.identity.main_sha,
    runId: target.identity.run_id,
    admission: target.admission,
    admissionEnvironment: admissionEnvironment(target),
    zoneId: 'b'.repeat(32),
  };
  const outputs = {
    workerBindings: {
      d1_database_id: 'db',
      kv_namespace_id: 'kv',
      worker_name: identity.workerName,
      queue_name: identity.names.queue,
      r2_bucket_name: identity.names.uploads,
    },
    migrationStorage: { bucket_name: identity.names.transfer, environment: identity.environment },
    targetIdentity: {
      account_id: identity.accountId,
      environment: identity.environment,
      generation: identity.generation,
      worker_name: identity.workerName,
      backend_key: identity.backendKey,
      d1_database_name: identity.names.d1,
      queue_id: 'queue',
      dlq_id: 'dlq',
      queue_settings: { delivery_paused: true },
      dlq_settings: { delivery_paused: true },
      consumer: [{
        consumer_id: 'consumer',
        queue_id: 'queue',
        account_id: identity.accountId,
        script_name: identity.workerName,
        type: 'worker',
        dead_letter_queue: identity.names.dlq,
        settings: { batch_size: 1, max_wait_time_ms: 1000, max_retries: 3, retry_delay: 30 },
      }],
    },
  };
  return { config, outputs, target };
};
it('normalizes actual provider consumer_id and rejects incomplete established outputs', () => {
  const { config, outputs, target } = fixture();
  expect(expectedTargetFromOutputs({ ...config, outputs })).toEqual(target);
  outputs.targetIdentity.consumer[0]!.consumer_id = '';
  expect(() => expectedTargetFromOutputs({ ...config, outputs })).toThrow();
});
it('publishes after resources, sealed deployment and paused consumer readback only', async () => {
  const { config, outputs } = fixture();
  const calls: string[] = [];
  let body: Buffer = Buffer.alloc(0);
  const preparation = {
    prepareResources: vi.fn(async () => {
      calls.push('resources');
      return outputs;
    }),
    attachSealedConsumer: vi.fn(async () => {
      calls.push('consumer');
      return {
        ...outputs,
        resources: { consumerId: 'consumer', queuePaused: true },
        worker: { versionId: 'version', mode: 'sealed', previewsEnabled: false, routeCount: 0 },
      };
    }),
  };
  const deploy = vi.fn(async () => {
    calls.push('deploy');
    return { workerName: config.identity.workerName, versionId: 'version' };
  });
  const storage = {
    assertPrivate: async () => {
      calls.push('privacy');
    },
    putNew: async (_key: string, value: Buffer) => {
      calls.push('put');
      body = value;
    },
    get: async () => {
      calls.push('get');
      return body;
    },
  };
  await prepareMigrationTarget({ config, preparation, deploy, storage });
  expect(calls).toEqual(['resources', 'deploy', 'consumer', 'privacy', 'put', 'get']);
  calls.length = 0;
  preparation.attachSealedConsumer.mockRejectedValueOnce(new Error('partial'));
  await expect(prepareMigrationTarget({ config, preparation, deploy, storage })).rejects.toThrow();
  expect(calls).toEqual(['resources', 'deploy']);
});
