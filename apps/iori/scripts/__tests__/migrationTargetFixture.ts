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
