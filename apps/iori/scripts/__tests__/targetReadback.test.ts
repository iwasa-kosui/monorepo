import { expect, it, vi } from 'vitest';

import { createTargetIdentity } from '../fresh-target.mjs';
import { createTargetControlPlane } from '../target-control-plane.mjs';
const identity = createTargetIdentity({
  environment: 'staging',
  generation: 'fixture1',
  accountId: 'a'.repeat(32),
  backendBucket: 'tf-state',
});
const r2Bucket = (name: string) => ({
  name,
  creation_date: '2026-10-01T00:00:00.000Z',
  location: 'apac',
  jurisdiction: 'default',
  storage_class: 'Standard',
});
const r2Response = (buckets: unknown[], extra: Record<string, unknown> = {}) => ({
  success: true,
  errors: [],
  messages: [],
  result: { buckets },
  ...extra,
});
// Exact documented pagination shapes: D1/KV omit total_pages; Queue includes it; R2 uses a cursor.
const inventoryResponse = (url: URL) => {
  if (url.pathname.endsWith('/workers/scripts')) return { success: true, result: [] };
  if (url.pathname.endsWith('/r2/buckets')) {
    return r2Response([r2Bucket('iori-tfstate'), r2Bucket('iori-uploads')], {
      result_info: { cursor: '', per_page: 100 },
    });
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
it('accepts documented complete D1/KV/Queue/R2 response shapes with only authenticated read APIs', async () => {
  const fetchRequest = vi.fn(async (url: URL, init: RequestInit) => {
    expect(init.method).toBe('GET');
    expect(init.redirect).toBe('error');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer private-token');
    return Response.json(inventoryResponse(url));
  });
  const api = createTargetControlPlane({ identity, token: 'private-token', fetchRequest });
  await expect(api.assertFresh()).resolves.toEqual({ fresh: true, resourceCount: 0 });
  expect(fetchRequest).toHaveBeenCalledTimes(5);
});
it.each(['/d1/database', '/storage/kv/namespaces'])(
  'accepts a complete nonempty %s page without total_pages',
  async (endpoint) => {
    const api = createTargetControlPlane({
      identity,
      token: 'private-token',
      fetchRequest: async (url: URL) =>
        Response.json(
          url.pathname.endsWith(endpoint)
            ? {
              success: true,
              result: [
                endpoint === '/d1/database'
                  ? { uuid: 'old-unrelated-id', name: 'unrelated-database' }
                  : { id: 'old-unrelated-id', title: 'unrelated-namespace', supports_url_encoding: true },
              ],
              result_info: { count: 1, page: 1, per_page: 100, total_count: 1 },
            }
            : inventoryResponse(url),
        ),
    });
    await expect(api.assertFresh()).resolves.toEqual({ fresh: true, resourceCount: 0 });
  },
);
it.each(['/d1/database', '/storage/kv/namespaces', '/queues'])(
  'rejects incomplete or inconsistent %s pagination',
  async (endpoint) => {
    const validInfo = {
      count: 0,
      page: 1,
      per_page: 100,
      total_count: 0,
      ...(endpoint === '/queues' ? { total_pages: 0 } : {}),
    };
    for (
      const info of [
        undefined,
        { ...validInfo, page: 2 },
        { ...validInfo, total_count: 1 },
        { ...validInfo, total_count: undefined },
        { ...validInfo, per_page: 0 },
        { ...validInfo, count: 1 },
        ...(endpoint === '/queues' ? [{ ...validInfo, total_pages: undefined }, { ...validInfo, total_pages: 2 }] : []),
      ]
    ) {
      const api = createTargetControlPlane({
        identity,
        token: 'private-token',
        fetchRequest: async (url: URL) =>
          Response.json(
            url.pathname.endsWith(endpoint)
              ? { success: true, result: [], result_info: info }
              : inventoryResponse(url),
          ),
      });
      await expect(api.assertFresh()).rejects.toThrow('Target readback failed');
    }
  },
);
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
const apiPaths = {
  workers: '/workers/scripts',
  d1: '/d1/database',
  kv: '/storage/kv/namespaces',
  queues: '/queues',
  r2: '/r2/buckets',
} as const;
const failureFor = async (api: keyof typeof apiPaths, respond: (url: URL) => Response | Promise<Response>) => {
  const control = createTargetControlPlane({
    identity,
    token: 'private-token',
    fetchRequest: async (url: URL) =>
      url.pathname.endsWith(apiPaths[api]) ? respond(url) : Response.json(inventoryResponse(url)),
  });
  return control.assertFresh();
};
const offsetInfo = (count: number, extra: Record<string, unknown> = {}) => ({
  count,
  page: 1,
  per_page: 100,
  total_count: count,
  ...extra,
});
const readbackFailure = (reason: string) => ({ message: 'Target readback failed.', diagnostic: { reason } });
it('classifies a Cloudflare HTTP failure by API and integer status only', async () => {
  await expect(failureFor('workers', () => Response.json({ success: false, errors: ['secret'] }, { status: 403 })))
    .rejects.toMatchObject(readbackFailure('workers-http-403'));
  await expect(failureFor('queues', () => new Response('secret', { status: 503 })))
    .rejects.toMatchObject(readbackFailure('queues-http-503'));
});
it('classifies an existing resource as exists', async () => {
  await expect(
    failureFor(
      'd1',
      () =>
        Response.json({ success: true, result: [{ uuid: 'x', name: identity.names.d1 }], result_info: offsetInfo(1) }),
    ),
  ).rejects.toMatchObject(readbackFailure('d1-exists'));
  await expect(failureFor('workers', () => Response.json({ success: true, result: [{ id: identity.workerName }] })))
    .rejects.toMatchObject(readbackFailure('workers-exists'));
});
it('classifies a non-string key as shape', async () => {
  await expect(failureFor('workers', () => Response.json({ success: true, result: [{ id: 1 }] })))
    .rejects.toMatchObject(readbackFailure('workers-shape'));
});
it('classifies pagination beyond one complete page as limit', async () => {
  const hundred = Array.from({ length: 100 }, (_, index) => ({ id: `id${index}`, title: `title${index}` }));
  await expect(
    failureFor('kv', () => Response.json({ success: true, result: hundred, result_info: offsetInfo(100) })),
  ).rejects.toMatchObject(readbackFailure('kv-limit'));
  await expect(
    failureFor(
      'r2',
      () => Response.json({ success: true, result: { buckets: [] }, result_info: { per_page: 100, cursor: 'next' } }),
    ),
  ).rejects.toMatchObject(readbackFailure('r2-limit'));
  await expect(
    failureFor(
      'queues',
      () => Response.json({ success: true, result: [], result_info: offsetInfo(0, { total_pages: 2 }) }),
    ),
  ).rejects.toMatchObject(readbackFailure('queues-limit'));
  await expect(
    failureFor(
      'd1',
      () => Response.json({ success: true, result: [], result_info: offsetInfo(0, { total_count: 3 }) }),
    ),
  ).rejects.toMatchObject(readbackFailure('d1-limit'));
});
const twoBuckets = () => [r2Bucket('iori-tfstate'), r2Bucket('iori-uploads')];
it.each([
  ['without result_info', undefined],
  ['with total_count and per_page', { total_count: 2, per_page: 100 }],
  ['with only an empty cursor', { cursor: '' }],
])('accepts a complete R2 list %s', async (_label, info) => {
  await expect(
    failureFor('r2', () => Response.json(r2Response(twoBuckets(), info === undefined ? {} : { result_info: info }))),
  ).resolves.toEqual({ fresh: true, resourceCount: 0 });
});
it.each([
  [
    'twenty buckets without result_info',
    () => r2Response(Array.from({ length: 20 }, (_, index) => r2Bucket(`bucket-${index}`))),
  ],
  ['a total_count larger than the buckets', () => r2Response(twoBuckets(), { result_info: { total_count: 3 } })],
  ['a next cursor', () => r2Response(twoBuckets(), { result_info: { cursor: 'next', per_page: 100 } })],
])('classifies an R2 list with %s as limit', async (_label, body) => {
  await expect(failureFor('r2', () => Response.json(body()))).rejects.toMatchObject(readbackFailure('r2-limit'));
});
it.each([
  ['a null result_info', () => r2Response(twoBuckets(), { result_info: null })],
  ['a string per_page', () => r2Response(twoBuckets(), { result_info: { per_page: '100' } })],
  ['a negative total_count', () => r2Response(twoBuckets(), { result_info: { total_count: -1 } })],
  ['a total_count smaller than the buckets', () => r2Response(twoBuckets(), { result_info: { total_count: 1 } })],
  ['an array result', () => ({ success: true, result: [] })],
])('classifies an R2 list with %s as shape', async (_label, body) => {
  await expect(failureFor('r2', () => Response.json(body()))).rejects.toMatchObject(readbackFailure('r2-shape'));
});
it.each([
  ['uploads', identity.names.uploads],
  ['transfer', identity.names.transfer],
])('classifies an existing R2 %s bucket as exists', async (_label, name) => {
  await expect(failureFor('r2', () => Response.json(r2Response([r2Bucket(name)]))))
    .rejects.toMatchObject(readbackFailure('r2-exists'));
});
it.each(Object.keys(apiPaths) as (keyof typeof apiPaths)[])(
  'classifies a fetch exception for %s as request',
  async (api) => {
    await expect(failureFor(api, () => Promise.reject(new Error('https://secret.invalid/path'))))
      .rejects.toMatchObject(readbackFailure(`${api}-request`));
  },
);
it('leaves an abort of the outer signal without a diagnostic', async () => {
  const controller = new AbortController();
  const control = createTargetControlPlane({
    identity,
    token: 'private-token',
    signal: controller.signal,
    fetchRequest: (_url: URL, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
        controller.abort();
      }),
  });
  const error = await control.assertFresh().then(() => undefined, (reason: unknown) => reason);
  expect(error).toBeDefined();
  expect(error).not.toHaveProperty('diagnostic');
});
it.each(Object.keys(apiPaths) as (keyof typeof apiPaths)[])('classifies broken JSON for %s as shape', async (api) => {
  await expect(failureFor(api, () => new Response('{not json')))
    .rejects.toMatchObject(readbackFailure(`${api}-shape`));
  await expect(failureFor(api, () => Response.json({ success: false, result: [] })))
    .rejects.toMatchObject(readbackFailure(`${api}-shape`));
});
it('classifies an oversized body as too-large', async () => {
  await expect(failureFor('workers', () => new Response('x'.repeat(2_000_001))))
    .rejects.toMatchObject(readbackFailure('workers-too-large'));
});
it('classifies readback mismatches as state-mismatch and a non-sealed admission as not-sealed', async () => {
  const control = createTargetControlPlane({
    identity,
    token: 'private-token',
    fetchRequest: async () => Response.json({}),
  });
  await expect(control.readResources({ d1Id: 'bad id', kvId: 'kv', queueId: 'q', dlqId: 'd' })).rejects.toMatchObject(
    readbackFailure('state-mismatch'),
  );
  await expect(
    control.readSealedWorker({
      resources: {} as never,
      admissionEnvironment: { IORI_ADMISSION_MODE: 'active' },
      zoneId: 'z',
      expectedVersionId: 'v',
    }),
  ).rejects.toMatchObject(readbackFailure('not-sealed'));
  const ok = createTargetControlPlane({
    identity,
    token: 'private-token',
    fetchRequest: async () => Response.json({ success: true, result: { id: 'other' } }),
  });
  await expect(ok.readQueuePause({ queueId: 'queue-id', paused: true })).rejects.toMatchObject(
    readbackFailure('state-mismatch'),
  );
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
    consumers_total_count: 0,
    producers_total_count: 0,
  },
  '/queues/dlq-id': {
    queue_id: ids.dlqId,
    queue_name: identity.names.dlq,
    created_on: '2026-09-05T00:00:00Z',
    settings: { delivery_paused: true },
    consumers: [],
    producers: [],
    consumers_total_count: 0,
    producers_total_count: 0,
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
  responses['/queues/queue-id'].consumers_total_count = 1;
  await expect(fixtureApi(responses).readResources({ ...ids, consumerAttached: true })).resolves.toMatchObject({
    consumerId: 'consumer-id',
  });
  (responses['/queues/queue-id'].producers as unknown[]).push({ type: 'worker', script: 'old-worker' });
  await expect(fixtureApi(responses).readResources({ ...ids, consumerAttached: true })).rejects.toThrow();
});
it('keeps preparation paused while the separate active readback retains complete Queue configuration', async () => {
  const responses = resourceResponses();
  responses['/queues/queue-id'].settings.delivery_paused = false;
  (responses['/queues/queue-id'].consumers as unknown[]).push({
    type: 'worker',
    script_name: identity.workerName,
    dead_letter_queue: identity.names.dlq,
    consumer_id: 'consumer-id',
    settings: { batch_size: 1, max_wait_time_ms: 1000, max_retries: 3, retry_delay: 30 },
  });
  responses['/queues/queue-id'].consumers_total_count = 1;
  await expect(fixtureApi(responses).readResources({ ...ids, consumerAttached: true })).rejects.toThrow();
  const active = await fixtureApi(responses).readActiveResources(ids);
  expect(active).toMatchObject({
    queuePaused: false,
    consumerId: 'consumer-id',
    queueConfiguration: { settings: { delivery_paused: false } },
    dlqConfiguration: { settings: { delivery_paused: true } },
  });
  responses['/queues/dlq-id'].settings.delivery_paused = false;
  await expect(fixtureApi(responses).readActiveResources(ids)).rejects.toThrow();
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
  await expect(api.readSealedWorker(input)).rejects.toMatchObject(readbackFailure('state-mismatch'));
  responses[`${root}/subdomain`] = { enabled: true, previews_enabled: false };
  bindings[0] = { name: 'DB', type: 'd1', id: 'old-db' };
  await expect(api.readSealedWorker(input)).rejects.toThrow();
  delete responses['/client/v4/zones/zone1/workers/routes'];
  await expect(api.readSealedWorker(input)).rejects.toMatchObject(readbackFailure('zones-shape'));
});

it.each(['/queues/queue-id', '/queues/dlq-id'])(
  'rejects incomplete or mismatched Queue consumer/producer totals for %s',
  async (endpoint) => {
    for (const field of ['consumers_total_count', 'producers_total_count']) {
      for (const count of [undefined, 1, -1, '0']) {
        const responses: Record<string, unknown> = resourceResponses();
        responses[endpoint] = { ...(responses[endpoint] as Record<string, unknown>), [field]: count };
        await expect(fixtureApi(responses).readResources(ids)).rejects.toThrow('Target readback failed');
      }
    }
  },
);
