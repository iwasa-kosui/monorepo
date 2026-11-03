export const expectedTargetFixture = () => ({
  schema: 'iori-migration-expected-target/v1' as const,
  identity: {
    environment: 'production' as const,
    generation: 'fixture1',
    main_sha: 'a'.repeat(40),
    run_id: 'production-run-001',
    account_id: 'a'.repeat(32),
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
