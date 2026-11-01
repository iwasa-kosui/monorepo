import { expect, it, vi } from 'vitest';

import { admissionEnvironment, expectedTargetFromOutputs, targetIdentity } from '../migration-target-contract.mjs';
import { preparationFailureReport, prepareMigrationTarget } from '../prepare-migration-target.mjs';
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
const stagedFixture = () => {
  const { config, outputs } = fixture();
  const calls: string[] = [];
  let body: Buffer = Buffer.alloc(0);
  const preparation = {
    prepareResources: async () => outputs,
    attachSealedConsumer: async () => ({
      ...outputs,
      resources: { consumerId: 'consumer', queuePaused: true },
      worker: { versionId: 'version', mode: 'sealed', previewsEnabled: false, routeCount: 0 },
    }),
  };
  const storage = {
    assertPrivate: async () => {
      calls.push('privacy');
    },
    putNew: async (_key: string, value: Buffer) => {
      body = value;
    },
    get: async () => body,
  };
  const onStage = (stage: string) => {
    calls.push(stage);
  };
  return { config, preparation, storage, onStage, calls };
};
it('reports the deploy, attach, readback and record stages in order', async () => {
  const { config, preparation, storage, onStage, calls } = stagedFixture();
  const deploy = async () => ({ workerName: config.identity.workerName, versionId: 'version' });
  await prepareMigrationTarget({ config, preparation, deploy, storage, onStage });
  expect(calls).toEqual(['deploy', 'attach', 'readback', 'record', 'privacy']);
});
it('classifies a Worker name mismatch as identity-mismatch before attaching', async () => {
  const { config, preparation, storage, onStage, calls } = stagedFixture();
  const deploy = async () => ({ workerName: 'other-worker', versionId: 'version' });
  await expect(prepareMigrationTarget({ config, preparation, deploy, storage, onStage })).rejects.toMatchObject({
    message: 'Prepared Worker identity mismatch.',
    diagnostic: { reason: 'identity-mismatch' },
  });
  expect(calls).toEqual(['deploy']);
});
it('classifies a readback mismatch as mismatch at the readback stage', async () => {
  const { config, preparation, storage, onStage, calls } = stagedFixture();
  const deploy = async () => ({ workerName: config.identity.workerName, versionId: 'other-version' });
  await expect(prepareMigrationTarget({ config, preparation, deploy, storage, onStage })).rejects.toMatchObject({
    message: 'Prepared target readback mismatch.',
    diagnostic: { reason: 'mismatch' },
  });
  expect(calls).toEqual(['deploy', 'attach', 'readback']);
  const broken = { ...preparation, attachSealedConsumer: async () => ({ resources: {}, worker: {} }) } as never;
  await expect(prepareMigrationTarget({ config, preparation: broken, deploy, storage, onStage })).rejects.toMatchObject(
    {
      diagnostic: { reason: 'mismatch' },
    },
  );
});
it('normalizes pretty/reordered admission once for preparation deployment and later readback', async () => {
  const { targetSetupConfiguration } = await import('../migration-target-setup.mjs');
  const target = expectedTargetFixture();
  const reordered = Object.fromEntries(Object.entries(target.admission).reverse());
  const environment = {
    IORI_ENVIRONMENT: target.identity.environment,
    IORI_GENERATION: target.identity.generation,
    CLOUDFLARE_ACCOUNT_ID: target.identity.account_id,
    IORI_TERRAFORM_BACKEND_BUCKET: target.identity.backend_bucket,
    MAIN_SHA: target.identity.main_sha,
    IORI_MIGRATION_RUN_ID: target.identity.run_id,
    CLOUDFLARE_ZONE_ID: 'b'.repeat(32),
    IORI_ADMISSION_IDENTITY: JSON.stringify(reordered, null, 2),
    ORIGIN: `https://${target.admission.hostname}`,
    CLOUDFLARE_API_TOKEN: 'fixture',
  };
  const config = targetSetupConfiguration(environment);
  expect(config.admissionEnvironment).toEqual(admissionEnvironment(target));
  const { outputs } = fixture();
  expect(admissionEnvironment(expectedTargetFromOutputs({ ...config, outputs }))).toEqual(config.admissionEnvironment);
  expect(() =>
    targetSetupConfiguration({
      ...environment,
      IORI_ADMISSION_IDENTITY: JSON.stringify({ ...target.admission, unknown: true }),
    })
  ).toThrow();
});
it('keeps paused preparation strict while the separate active-output policy retains immutable identity', async () => {
  const { activeTargetFromOutputs } = await import('../migration-target-contract.mjs');
  const { config, outputs, target } = fixture();
  expect(() => activeTargetFromOutputs({ ...config, outputs })).toThrow();
  outputs.targetIdentity.queue_settings.delivery_paused = false;
  expect(() => expectedTargetFromOutputs({ ...config, outputs })).toThrow();
  expect(activeTargetFromOutputs({ ...config, outputs })).toEqual(target);
  outputs.targetIdentity.dlq_settings.delivery_paused = false;
  expect(() => activeTargetFromOutputs({ ...config, outputs })).toThrow();
});
it('reports exit code 78 when preparation stopped before creating resources', () => {
  expect(preparationFailureReport(false)).toEqual({
    message: 'Target preparation stopped before creating resources; fix the inputs and rerun with the same generation.',
    exitCode: 78,
  });
});
it('reports exit code 1 when resource preparation had started', () => {
  expect(preparationFailureReport(true)).toEqual({
    message: 'Target preparation failed; retain generation and any record for reviewed recovery.',
    exitCode: 1,
  });
});
