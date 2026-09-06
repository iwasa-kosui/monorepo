import { admissionEnvironment, targetIdentity } from '../migration-target-contract.mjs';
import { createHash } from 'node:crypto';
export const expectedTargetFixture = () => ({
  schema: 'iori-migration-expected-target/v1' as const,
  identity: {
    environment: 'production' as const,
    generation: 'fixture1',
    main_sha: 'a'.repeat(40),
    run_id: 'production-run-001',
    account_id: 'a'.repeat(32),
    backend_bucket: 'tf-state',
    backend_key: 'iori/production/fixture1/terraform.tfstate',
    worker_name: 'iori-production-fixture1',
  },
  resources: {
    d1: { id: 'db', name: 'iori-production-fixture1' },
    kv: { id: 'kv', name: 'iori-production-fixture1-fedify' },
    uploads: { name: 'iori-production-fixture1-uploads' },
    transfer: { name: 'iori-production-fixture1-transfer' },
    queue: { id: 'queue', name: 'iori-production-fixture1-fedify' },
    dlq: { id: 'dlq', name: 'iori-production-fixture1-dlq' },
    consumer: {
      id: 'consumer',
      queue_id: 'queue',
      worker_name: 'iori-production-fixture1',
      dead_letter_queue_id: 'dlq',
    },
  },
  admission: {
    environment: 'production' as const,
    generation: 'fixture1',
    mainSha: 'a'.repeat(40),
    runId: 'production-run-001',
    hostname: 'blog.test',
    workerHostname: 'iori-production-fixture1.account.workers.dev',
    smoke: {
      username: 'test',
      uploadFilename: '11111111-1111-4111-8111-111111111111.png',
      articleId: '11111111-1111-4111-8111-111111111111',
    },
  },
});
export const preparationFixture = () => {
  const { schema: _schema, ...target } = expectedTargetFixture();
  return {
    schema: 'iori-target-preparation/v1' as const,
    ...target,
    observed: {
      worker_version_id: 'version',
      admission_mode: 'sealed' as const,
      previews_enabled: false as const,
      route_present: false as const,
      queue_delivery_paused: true as const,
      dlq_delivery_paused: true as const,
      consumer_id: 'consumer',
    },
  };
};
export const targetSummaryFixture = () => {
  const record = preparationFixture();
  const canonical = (value: any): any =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
      : value;
  const body = Buffer.from(JSON.stringify(canonical(record)) + '\n');
  return {
    schema: 'iori-migration-phase-artifact/v1/terraform_target_summary' as const,
    status: 'completed' as const,
    identity: structuredClone(record.identity),
    resources: structuredClone(record.resources),
    admission: structuredClone(record.admission),
    preparation: { record_sha256: createHash('sha256').update(body).digest('hex'), record },
    observed: structuredClone(record.observed),
  };
};

export const targetOutputsFixture = () => {
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
