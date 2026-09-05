import { expect, it, vi } from 'vitest';
import { createTargetIdentity } from '../fresh-target.mjs';
import { createTargetControlPlane } from '../target-control-plane.mjs';
const identity = createTargetIdentity({
  environment: 'staging',
  generation: 'fixture1',
  accountId: 'a'.repeat(32),
  backendBucket: 'tf-state',
});
it('uses only authenticated read APIs and refuses partial freshness inventory', async () => {
  const fetchRequest = vi.fn(async (url: URL, init: RequestInit) => {
    expect(init.method).toBe('GET');
    expect(init.redirect).toBe('error');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer private-token');
    return Response.json({
      success: true,
      result: url.pathname.endsWith('/r2/buckets') ? { buckets: [] } : [],
      result_info: { per_page: 100, page: 1, total_count: 0, total_pages: 0 },
    });
  });
  const api = createTargetControlPlane({ identity, token: 'private-token', fetchRequest });
  await expect(api.assertFresh()).resolves.toEqual({ fresh: true, resourceCount: 0 });
  expect(fetchRequest).toHaveBeenCalledTimes(5);
  const partial = createTargetControlPlane({
    identity,
    token: 'private-token',
    fetchRequest: async () => Response.json({ success: true, result: [], result_info: { total_pages: 999 } }),
  });
  await expect(partial.assertFresh()).rejects.toThrow('Target readback failed');
});
it('rejects identity collisions and private API failures without leaking bodies', async () => {
  for (const result of [[{ id: identity.workerName }], [{ name: identity.names.d1 }]]) {
    const api = createTargetControlPlane({
      identity,
      token: 'private-token',
      fetchRequest: async () => Response.json({ success: true, result }),
    });
    await expect(api.assertFresh()).rejects.toThrow('Target readback failed');
  }
  const api = createTargetControlPlane({
    identity,
    token: 'private-token',
    fetchRequest: async () => Response.json({ success: false, errors: ['secret payload'] }, { status: 403 }),
  });
  await expect(api.assertFresh()).rejects.toThrow(/^Target readback failed\.$/);
});
const ids = { d1Id: 'db-id', kvId: 'kv-id', queueId: 'queue-id', dlqId: 'dlq-id' };
const resourceResponses = () => ({
  '/d1/database/db-id': { uuid: ids.d1Id, name: identity.names.d1 },
  '/storage/kv/namespaces/kv-id': { id: ids.kvId, title: identity.names.kv },
  [`/r2/buckets/${identity.names.uploads}`]: { name: identity.names.uploads },
  [`/r2/buckets/${identity.names.transfer}`]: { name: identity.names.transfer },
  [`/r2/buckets/${identity.names.transfer}/domains/managed`]: { enabled: false },
  '/queues/queue-id': {
    queue_id: ids.queueId,
    queue_name: identity.names.queue,
    created_on: '2026-09-05T00:00:00Z',
    settings: { delivery_paused: true },
    consumers: [],
    producers: [],
  },
  '/queues/dlq-id': {
    queue_id: ids.dlqId,
    queue_name: identity.names.dlq,
    created_on: '2026-09-05T00:00:00Z',
    settings: { delivery_paused: true },
    consumers: [],
    producers: [],
  },
});
const fixtureApi = (responses: Record<string, unknown>) =>
  createTargetControlPlane({
    identity,
    token: 'private-token',
    fetchRequest: async (url: URL) => {
      const path = url.pathname.replace(`/client/v4/accounts/${identity.accountId}`, '');
      const result = responses[path];
      return Response.json(result === undefined ? { success: false } : { success: true, result });
    },
  });
it('reads exact storage and Queue identities and refuses unpaused/unavailable/drifted resources', async () => {
  await expect(fixtureApi(resourceResponses()).readResources(ids)).resolves.toMatchObject({
    ...ids,
    queuePaused: true,
    consumerId: null,
  });
  const missing = resourceResponses();
  delete (missing as Record<string, unknown>)['/queues/dlq-id'];
  await expect(fixtureApi(missing).readResources(ids)).rejects.toThrow();
  const resumed = resourceResponses();
  resumed['/queues/queue-id'].settings.delivery_paused = false;
  await expect(fixtureApi(resumed).readResources(ids)).rejects.toThrow();
  const old = resourceResponses();
  old['/d1/database/db-id'].name = 'old';
  await expect(fixtureApi(old).readResources(ids)).rejects.toThrow();
});
it('requires the expected paused consumer target and rejects unexpected producers', async () => {
  const responses = resourceResponses();
  (responses['/queues/queue-id'].consumers as unknown[]).push({
    type: 'worker',
    script_name: identity.workerName,
    dead_letter_queue: identity.names.dlq,
    consumer_id: 'consumer-id',
    settings: { batch_size: 1, max_wait_time_ms: 1000, max_retries: 3, retry_delay: 30 },
  });
  await expect(fixtureApi(responses).readResources({ ...ids, consumerAttached: true })).resolves.toMatchObject({
    consumerId: 'consumer-id',
  });
  (responses['/queues/queue-id'].producers as unknown[]).push({ type: 'worker', script: 'old-worker' });
  await expect(fixtureApi(responses).readResources({ ...ids, consumerAttached: true })).rejects.toThrow();
});
it('verifies deployed version, bindings, preview and route state without exposing secrets', async () => {
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
  const bindings = [
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
  const root = `/workers/scripts/${identity.workerName}`;
  const responses: Record<string, unknown> = {
    ...resourceResponses(),
    [`${root}/deployments`]: { deployments: [{ versions: [{ percentage: 100, version_id: 'version1' }] }] },
    [`${root}/versions/version1`]: { id: 'version1', resources: { bindings } },
    [`${root}/subdomain`]: { enabled: true, previews_enabled: false },
    '/client/v4/zones/zone1/workers/routes': [],
  };
  const api = fixtureApi(responses);
  const resources = await api.readResources(ids);
  const input = { resources, admissionEnvironment, zoneId: 'zone1', expectedVersionId: 'version1' };
  const result = await api.readSealedWorker(input);
  expect(result.mode).toBe('sealed');
  expect(JSON.stringify(result)).not.toContain('secret-must-not-leak');
  responses[`${root}/subdomain`] = { enabled: true, previews_enabled: true };
  await expect(api.readSealedWorker(input)).rejects.toThrow();
  responses[`${root}/subdomain`] = { enabled: true, previews_enabled: false };
  bindings[0] = { name: 'DB', type: 'd1', id: 'old-db' };
  await expect(api.readSealedWorker(input)).rejects.toThrow();
});
