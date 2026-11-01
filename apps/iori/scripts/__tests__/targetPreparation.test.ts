import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';

import { createTargetIdentity } from '../fresh-target.mjs';
import { createTargetPreparation } from '../prepare-target.mjs';

const identityInput = {
  environment: 'staging',
  generation: 'fixture1',
  accountId: 'a'.repeat(32),
  backendBucket: 'tf-state',
} as const;
const identity = createTargetIdentity(identityInput);
const ids = { d1Id: 'db-id', kvId: 'kv-id', queueId: 'queue-id', dlqId: 'dlq-id' };
const workerBindings = {
  d1_database_id: ids.d1Id,
  kv_namespace_id: ids.kvId,
  worker_name: identity.workerName,
  r2_bucket_name: identity.names.uploads,
  queue_name: identity.names.queue,
};
const targetIdentity = {
  account_id: identity.accountId,
  environment: identity.environment,
  generation: identity.generation,
  backend_key: identity.backendKey,
  worker_name: identity.workerName,
  queue_id: ids.queueId,
  dlq_id: ids.dlqId,
  queue_settings: { delivery_paused: true },
};
const terraformOutputs = {
  worker_bindings: { value: workerBindings },
  target_identity: { value: targetIdentity },
  migration_storage: { value: { bucket_name: identity.names.transfer, environment: identity.environment } },
};
const freshPlan = {
  resource_changes: [{
    address: 'cloudflare_d1_database.iori',
    change: { actions: ['create'], before: null, after: { account_id: identity.accountId, name: identity.names.d1 } },
  }],
};
const consumerSettings = { batch_size: 1, max_wait_time_ms: 1000, max_retries: 3, retry_delay: 30 };
const consumerPlan = {
  resource_changes: [{
    address: 'cloudflare_queue_consumer.fedify[0]',
    change: {
      actions: ['create'],
      before: null,
      after: {
        account_id: identity.accountId,
        script_name: identity.workerName,
        type: 'worker',
        queue_id: ids.queueId,
        dead_letter_queue: identity.names.dlq,
        settings: consumerSettings,
      },
    },
  }],
  output_changes: {
    target_identity: { before: { queue_id: ids.queueId } },
    worker_bindings: { actions: ['no-op'], before: workerBindings, after: workerBindings },
  },
  planned_values: { outputs: { worker_bindings: { value: workerBindings } } },
};
const inventoryResponse = (url: URL) => {
  if (url.pathname.endsWith('/workers/scripts')) return { success: true, result: [] };
  if (url.pathname.endsWith('/r2/buckets')) {
    return { success: true, result: { buckets: [] }, result_info: { per_page: 100 } };
  }
  return {
    success: true,
    result: [],
    result_info: {
      count: 0,
      page: 1,
      per_page: 100,
      total_count: 0,
      ...(url.pathname.endsWith('/queues') ? { total_pages: 0 } : {}),
    },
  };
};
const queueState = (queueId: string, name: string, consumers: unknown[]) => ({
  queue_id: queueId,
  queue_name: name,
  created_on: '2026-09-05T00:00:00Z',
  settings: { delivery_paused: true },
  consumers,
  producers: [],
  consumers_total_count: consumers.length,
  producers_total_count: 0,
});
const admissionEnvironment = {
  ORIGIN: 'https://staging.test',
  IORI_ADMISSION_MODE: 'sealed',
  IORI_ADMISSION_IDENTITY: JSON.stringify({
    environment: 'staging',
    generation: 'fixture1',
    mainSha: 'a'.repeat(40),
    runId: 'run1',
    hostname: 'staging.test',
    workerHostname: `${identity.workerName}.fixture.workers.dev`,
    smoke: {
      username: 'iori-smoke',
      uploadFilename: '00000000-0000-4000-8000-000000000000.png',
      articleId: '00000000-0000-4000-8000-000000000000',
    },
  }),
};
const workerBindingList = [
  { name: 'DB', type: 'd1', id: ids.d1Id },
  { name: 'UPLOADS', type: 'r2_bucket', bucket_name: identity.names.uploads },
  { name: 'FEDIFY_KV', type: 'kv_namespace', namespace_id: ids.kvId },
  { name: 'FEDIFY_QUEUE', type: 'queue', queue_name: identity.names.queue },
  { name: 'ASSETS', type: 'assets' },
  ...Object.entries(admissionEnvironment).map(([name, text]) => ({ name, type: 'plain_text', text })),
  ...['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'SMOKE_QUEUE_TOKEN', 'STAGING_ACCESS_TOKEN'].map((name) => ({
    name,
    type: 'secret_text',
    text: 'secret-must-not-leak',
  })),
];
const scenario = async (
  { failWorkers = false, failInit = false }: { failWorkers?: boolean; failInit?: boolean } = {},
) => {
  const stages: string[] = [];
  let applied = 0;
  let queuePaused = true;
  const root = `/accounts/${identity.accountId}`;
  const script = `${root}/workers/scripts/${identity.workerName}`;
  const responses = (): Record<string, unknown> => ({
    [`${root}/d1/database/${ids.d1Id}`]: { uuid: ids.d1Id, name: identity.names.d1 },
    [`${root}/storage/kv/namespaces/${ids.kvId}`]: { id: ids.kvId, title: identity.names.kv },
    [`${root}/r2/buckets/${identity.names.uploads}`]: { name: identity.names.uploads },
    [`${root}/r2/buckets/${identity.names.transfer}`]: { name: identity.names.transfer },
    [`${root}/r2/buckets/${identity.names.transfer}/domains/managed`]: { enabled: false },
    [`${root}/queues/${ids.queueId}`]: {
      ...queueState(
        ids.queueId,
        identity.names.queue,
        applied === 2
          ? [{
            type: 'worker',
            script_name: identity.workerName,
            dead_letter_queue: identity.names.dlq,
            consumer_id: 'consumer-id',
            settings: consumerSettings,
          }]
          : [],
      ),
      ...(queuePaused ? {} : { settings: { delivery_paused: false } }),
    },
    [`${root}/queues/${ids.dlqId}`]: queueState(ids.dlqId, identity.names.dlq, []),
    [`${script}/deployments`]: { deployments: [{ versions: [{ percentage: 100, version_id: 'version1' }] }] },
    [`${script}/versions/version1`]: { id: 'version1', resources: { bindings: workerBindingList } },
    [`${script}/subdomain`]: { enabled: true, previews_enabled: false },
    '/zones/zone1/workers/routes': [],
  });
  const fetchRequest = vi.fn(async (url: URL) => {
    if (failWorkers && url.pathname.endsWith('/workers/scripts')) {
      return Response.json({ success: false, errors: ['secret'] }, { status: 403 });
    }
    if (/\/(workers\/scripts|d1\/database|storage\/kv\/namespaces|queues|r2\/buckets)$/.test(url.pathname)) {
      return Response.json(inventoryResponse(url));
    }
    const result = responses()[url.pathname.replace('/client/v4', '')];
    return Response.json(result === undefined ? { success: false } : { success: true, result });
  });
  const runCommand = vi.fn(async (_program: string, args: string[]) => {
    const subcommand = args[1];
    if (failInit && subcommand === 'init') return { status: 1, stdout: '', stderr: 'secret' };
    if (subcommand === 'apply') applied += 1;
    const stdout = subcommand === 'show'
      ? args.length > 3 ? JSON.stringify(applied === 0 ? freshPlan : consumerPlan) : '{}'
      : subcommand === 'output'
      ? JSON.stringify(terraformOutputs)
      : '';
    return { status: 0, stdout, stderr: '' };
  });
  const preparation = createTargetPreparation({
    identity,
    token: 'private-token',
    fetchRequest,
    runCommand,
    backendEndpoint: `https://${'b'.repeat(32)}.r2.cloudflarestorage.com`,
    privateDirectory: await mkdtemp(join(tmpdir(), 'target-preparation-')),
    zoneId: 'c'.repeat(32),
    hostname: 'staging.test',
    onStage: (stage: string) => {
      stages.push(stage);
    },
  });
  return { preparation, stages, runCommand, fetchRequest, resumeQueue: () => (queuePaused = false) };
};
it('stops at fresh-check without running Terraform when the Cloudflare inventory read fails', async () => {
  const { preparation, stages, runCommand } = await scenario({ failWorkers: true });
  await expect(preparation.prepareResources()).rejects.toMatchObject({ diagnostic: { reason: 'workers-http-403' } });
  expect(stages.at(-1)).toBe('fresh-check');
  expect(runCommand).not.toHaveBeenCalled();
});
it('stops at tf-init with command-failed when terraform init fails', async () => {
  const { preparation, stages } = await scenario({ failInit: true });
  await expect(preparation.prepareResources()).rejects.toMatchObject({ diagnostic: { reason: 'command-failed' } });
  expect(stages.at(-1)).toBe('tf-init');
});
it('reports every stage in order from fresh-check through attach-read', async () => {
  const { preparation, stages } = await scenario();
  await preparation.prepareResources();
  await preparation.attachSealedConsumer({
    admissionEnvironment,
    zoneId: 'zone1',
    expectedVersionId: 'version1',
  });
  expect(stages).toEqual([
    'fresh-check',
    'tf-init',
    'tf-show',
    'tf-plan',
    'tf-apply',
    'resource-read',
    'attach',
    'attach-tf-plan',
    'attach-tf-apply',
    'attach-read',
  ]);
});
it('reads the Queue pause state through the Queue API without reporting a stage', async () => {
  const { preparation, stages, fetchRequest } = await scenario();
  await preparation.prepareResources();
  stages.length = 0;
  fetchRequest.mockClear();
  await expect(preparation.assertQueuePaused()).resolves.toBeUndefined();
  expect(stages).toEqual([]);
  expect(fetchRequest).toHaveBeenCalledTimes(1);
  expect(fetchRequest.mock.calls[0]![0].pathname).toBe(
    `/client/v4/accounts/${identity.accountId}/queues/${ids.queueId}`,
  );
});
it('fails with queue-not-paused when the Queue API reports delivery resumed', async () => {
  const { preparation, resumeQueue } = await scenario();
  await preparation.prepareResources();
  resumeQueue();
  await expect(preparation.assertQueuePaused()).rejects.toMatchObject({ diagnostic: { reason: 'queue-not-paused' } });
});
it('rejects the Queue pause check before resources are established', async () => {
  const { preparation, fetchRequest } = await scenario();
  await expect(preparation.assertQueuePaused()).rejects.toThrow('Target resources have not been established.');
  expect(fetchRequest).not.toHaveBeenCalled();
});
