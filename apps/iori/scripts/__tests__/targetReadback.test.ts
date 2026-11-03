import { describe, expect, it, vi } from 'vitest';

import { createTargetIdentity } from '../fresh-target.mjs';
import { createTargetControlPlane } from '../target-control-plane.mjs';
const identity = createTargetIdentity({
  environment: 'staging',
  generation: 'fixture1',
  accountId: 'a'.repeat(32),
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
    settings: { delivery_paused: false },
    consumers: [{
      type: 'worker',
      script: identity.workerName,
      dead_letter_queue: identity.names.dlq,
      consumer_id: 'consumer-id',
      settings: { batch_size: 1, max_wait_time_ms: 1000, max_retries: 3, retry_delay: 30 },
    }],
    producers: [],
    consumers_total_count: 1,
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
it('reads only through authenticated GET requests that refuse redirects', async () => {
  const responses: Record<string, unknown> = resourceResponses();
  const fetchRequest = vi.fn(async (url: URL, init: RequestInit) => {
    expect(init.method).toBe('GET');
    expect(init.redirect).toBe('error');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer private-token');
    return Response.json({
      success: true,
      result: responses[url.pathname.replace(`/client/v4/accounts/${identity.accountId}`, '')],
    });
  });
  const api = createTargetControlPlane({ identity, token: 'private-token', fetchRequest });
  await expect(api.readActiveResources(ids)).resolves.toMatchObject({ queuePaused: false });
  expect(fetchRequest).toHaveBeenCalledTimes(7);
});
const apiPaths = {
  workers: '/workers/scripts',
  d1: '/d1/database',
  kv: '/storage/kv/namespaces',
  queues: '/queues',
  r2: '/r2/buckets',
} as const;
const failureFor = async (api: keyof typeof apiPaths, respond: (url: URL) => Response | Promise<Response>) => {
  const responses: Record<string, unknown> = resourceResponses();
  const control = createTargetControlPlane({
    identity,
    token: 'private-token',
    fetchRequest: async (url: URL) => {
      if (url.pathname.includes(apiPaths[api])) return respond(url);
      const result = responses[url.pathname.replace(`/client/v4/accounts/${identity.accountId}`, '')];
      return Response.json(result === undefined ? { success: false } : { success: true, result });
    },
  });
  return api === 'workers' ? control.readCurrentVersion() : control.readActiveResources(ids);
};
const readbackFailure = (reason: string) => ({ message: 'Target readback failed.', diagnostic: { reason } });
const resourceFailure = (details: string[]) => ({
  message: 'Target readback failed.',
  diagnostic: { reason: 'state-mismatch', details },
});
it('classifies a Cloudflare HTTP failure by API and integer status only', async () => {
  await expect(failureFor('workers', () => Response.json({ success: false, errors: ['secret'] }, { status: 403 })))
    .rejects.toMatchObject(readbackFailure('workers-http-403'));
  await expect(failureFor('queues', () => new Response('secret', { status: 503 })))
    .rejects.toMatchObject(readbackFailure('queues-http-503'));
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
  const error = await control.readCurrentVersion().then(() => undefined, (reason: unknown) => reason);
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
it('classifies readback mismatches and a non-active admission as state-mismatch', async () => {
  const control = createTargetControlPlane({
    identity,
    token: 'private-token',
    fetchRequest: async () => Response.json({}),
  });
  await expect(control.readActiveResources({ d1Id: 'bad id', kvId: 'kv', queueId: 'q', dlqId: 'd' })).rejects
    .toMatchObject(readbackFailure('state-mismatch'));
  await expect(
    Promise.resolve().then(() =>
      control.readActiveWorker({
        resources: {} as never,
        admissionEnvironment: { IORI_ADMISSION_MODE: 'sealed' },
        zoneId: 'z',
        expectedVersionId: 'v',
        routePresent: true,
      })
    ),
  ).rejects.toMatchObject(readbackFailure('state-mismatch'));
});
it('reads exact storage and Queue identities and refuses paused/unavailable/drifted resources', async () => {
  await expect(fixtureApi(resourceResponses()).readActiveResources(ids)).resolves.toMatchObject({
    ...ids,
    queuePaused: false,
    consumerId: 'consumer-id',
  });
  const missing = resourceResponses();
  delete (missing as Record<string, unknown>)['/queues/dlq-id'];
  await expect(fixtureApi(missing).readActiveResources(ids)).rejects.toThrow();
  const paused = resourceResponses();
  paused['/queues/queue-id'].settings.delivery_paused = true;
  await expect(fixtureApi(paused).readActiveResources(ids)).rejects.toThrow();
  const old = resourceResponses();
  old['/d1/database/db-id'].name = 'old';
  await expect(fixtureApi(old).readActiveResources(ids)).rejects.toThrow();
});
it('requires the expected consumer target and rejects unexpected producers', async () => {
  const responses = resourceResponses();
  await expect(fixtureApi(responses).readActiveResources(ids)).resolves.toMatchObject({
    consumerId: 'consumer-id',
  });
  (responses['/queues/queue-id'].producers as unknown[]).push({ type: 'worker', script: 'old-worker' });
  await expect(fixtureApi(responses).readActiveResources(ids)).rejects.toThrow();
});
it('retains complete Queue configuration in the active readback', async () => {
  const responses = resourceResponses();
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
    IORI_ADMISSION_MODE: 'active',
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
    '/client/v4/zones/zone1/workers/routes': [{ script: identity.workerName, pattern: 'staging.test/*' }],
  };
  const api = fixtureApi(responses);
  const resources = await api.readActiveResources(ids);
  const input = {
    resources,
    admissionEnvironment,
    zoneId: 'zone1',
    expectedVersionId: 'version1',
    routePresent: true as const,
  };
  const result = await api.readActiveWorker(input);
  expect(result).toMatchObject({ mode: 'active' });
  expect(JSON.stringify(result)).not.toContain('secret-must-not-leak');
  responses[`${root}/subdomain`] = { enabled: true, previews_enabled: true };
  await expect(api.readActiveWorker(input)).rejects.toThrow();
  await expect(api.readActiveWorker(input)).rejects.toMatchObject(readbackFailure('worker-subdomain'));
  responses[`${root}/subdomain`] = { enabled: true, previews_enabled: false };
  bindings[0] = { name: 'DB', type: 'd1', id: 'old-db' };
  await expect(api.readActiveWorker(input)).rejects.toThrow();
  delete responses['/client/v4/zones/zone1/workers/routes'];
  await expect(api.readActiveWorker(input)).rejects.toMatchObject(readbackFailure('zones-shape'));
});

const routesPath = '/client/v4/zones/zone1/workers/routes';
const workerFixture = async () => {
  const admissionEnvironment = {
    ORIGIN: 'https://staging.test',
    IORI_ADMISSION_MODE: 'active',
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
  const bindings: Record<string, unknown>[] = [
    { name: 'DB', type: 'd1', id: ids.d1Id },
    { name: 'UPLOADS', type: 'r2_bucket', bucket_name: identity.names.uploads },
    { name: 'FEDIFY_KV', type: 'kv_namespace', namespace_id: ids.kvId },
    { name: 'FEDIFY_QUEUE', type: 'queue', queue_name: identity.names.queue },
    { name: 'ASSETS', type: 'assets' },
    ...Object.entries(admissionEnvironment).map(([name, text]) => ({ name, type: 'plain_text', text })),
    ...['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'SMOKE_QUEUE_TOKEN', 'STAGING_ACCESS_TOKEN'].map((name) => ({
      name,
      type: 'secret_text',
      text: 'secret-value',
    })),
  ];
  const root = `/workers/scripts/${identity.workerName}`;
  const responses: Record<string, unknown> = {
    ...resourceResponses(),
    [`${root}/deployments`]: { deployments: [{ versions: [{ percentage: 100, version_id: 'version1' }] }] },
    [`${root}/versions/version1`]: { id: 'version1', resources: { bindings } },
    [`${root}/subdomain`]: { enabled: true, previews_enabled: false },
    [routesPath]: [{ script: identity.workerName, pattern: 'staging.test/*' }],
  };
  const api = fixtureApi(responses);
  const resources = await api.readActiveResources(ids);
  const input = {
    resources,
    admissionEnvironment,
    zoneId: 'zone1',
    expectedVersionId: 'version1',
    routePresent: true as const,
  };
  return { api, input, responses, bindings, root };
};
type WorkerFixture = Awaited<ReturnType<typeof workerFixture>>;
const withoutBinding = (name: string) => ({ bindings }: WorkerFixture) => {
  bindings.splice(bindings.findIndex((binding) => binding.name === name), 1);
};
const workerReadbackCases: [string, string, (fixture: WorkerFixture) => Partial<WorkerFixture['input']> | void][] = [
  ['state-mismatch', 'a routePresent that is not true', () => ({ routePresent: false as never })],
  [
    'worker-input',
    'an admission identity that does not parse',
    ({ input }) => ({ admissionEnvironment: { ...input.admissionEnvironment, IORI_ADMISSION_IDENTITY: 'not json' } }),
  ],
  [
    'worker-input',
    'an admission generation that differs from the identity',
    ({ input }) => ({
      admissionEnvironment: {
        ...input.admissionEnvironment,
        IORI_ADMISSION_IDENTITY: JSON.stringify({
          ...JSON.parse(input.admissionEnvironment.IORI_ADMISSION_IDENTITY),
          generation: 'fixture2',
          workerHostname: `iori-staging-fixture2.fixture.workers.dev`,
        }),
      },
    }),
  ],
  ['worker-input', 'a zone id that is not a safe id', () => ({ zoneId: 'zone 1' })],
  ['worker-input', 'a version id that is not a safe id', () => ({ expectedVersionId: 'version 1' })],
  [
    'worker-resources',
    'resources of another identity',
    ({ input }) => ({ resources: { ...input.resources, identity: { ...identity, generation: 'other' } } }),
  ],
  [
    'worker-resources',
    'resources whose queue is paused',
    ({ input }) => ({ resources: { ...input.resources, queuePaused: true as never } }),
  ],
  [
    'worker-deployment',
    'deployments that are not an array',
    ({ responses, root }) => {
      responses[`${root}/deployments`] = { deployments: {} };
    },
  ],
  [
    'worker-deployment',
    'two versions in the latest deployment',
    ({ responses, root }) => {
      responses[`${root}/deployments`] = {
        deployments: [{
          versions: [{ percentage: 50, version_id: 'version1' }, { percentage: 50, version_id: 'version0' }],
        }],
      };
    },
  ],
  [
    'worker-deployment',
    'a deployment below 100 percent',
    ({ responses, root }) => {
      responses[`${root}/deployments`] = { deployments: [{ versions: [{ percentage: 50, version_id: 'version1' }] }] };
    },
  ],
  [
    'worker-deployment',
    'a deployment of another version',
    ({ responses, root }) => {
      responses[`${root}/deployments`] = { deployments: [{ versions: [{ percentage: 100, version_id: 'version0' }] }] };
    },
  ],
  [
    'worker-version',
    'a version with another id',
    ({ responses, bindings, root }) => {
      responses[`${root}/versions/version1`] = { id: 'version0', resources: { bindings } };
    },
  ],
  [
    'worker-subdomain',
    'a disabled workers.dev subdomain',
    ({ responses, root }) => {
      responses[`${root}/subdomain`] = { enabled: false, previews_enabled: false };
    },
  ],
  [
    'worker-subdomain',
    'enabled previews',
    ({ responses, root }) => {
      responses[`${root}/subdomain`] = { enabled: true, previews_enabled: true };
    },
  ],
  [
    'worker-route',
    'routes that are not an array',
    ({ responses }) => {
      responses[routesPath] = {};
    },
  ],
  [
    'worker-route',
    'a missing route of this Worker',
    ({ responses }) => {
      responses[routesPath] = [];
    },
  ],
  [
    'worker-route',
    'a route pattern of another hostname',
    ({ responses }) => {
      responses[routesPath] = [{ script: identity.workerName, pattern: 'other.test/*' }];
    },
  ],
  [
    'worker-bindings-shape',
    'bindings that are not an array',
    ({ responses, root }) => {
      responses[`${root}/versions/version1`] = { id: 'version1', resources: { bindings: {} } };
    },
  ],
  [
    'worker-bindings-shape',
    'a duplicated binding name',
    ({ bindings }) => {
      bindings.push({ name: 'ASSETS', type: 'assets' });
    },
  ],
  ['worker-binding-missing', 'a missing DB binding', withoutBinding('DB')],
  ['worker-binding-missing', 'a missing ORIGIN binding', withoutBinding('ORIGIN')],
  [
    'worker-binding-mismatch',
    'a DB binding of another database',
    ({ bindings }) => {
      bindings[0] = { name: 'DB', type: 'd1', id: 'old-db' };
    },
  ],
  [
    'worker-binding-mismatch',
    'an ASSETS binding of another type',
    ({ bindings }) => {
      bindings[4] = { name: 'ASSETS', type: 'plain_text', text: 'assets' };
    },
  ],
  [
    'worker-binding-extra',
    'a binding that is not expected',
    ({ bindings }) => {
      bindings.push({ name: 'UNEXPECTED', type: 'plain_text', text: 'x' });
    },
  ],
  ['worker-secret-missing', 'a missing SMOKE_QUEUE_TOKEN secret', withoutBinding('SMOKE_QUEUE_TOKEN')],
  [
    'worker-secret-missing',
    'a STAGING_ACCESS_TOKEN that is not a secret_text',
    ({ bindings }) => {
      bindings[bindings.findIndex((binding) => binding.name === 'STAGING_ACCESS_TOKEN')] = {
        name: 'STAGING_ACCESS_TOKEN',
        type: 'plain_text',
        text: 'x',
      };
    },
  ],
];
it('reads a complete worker fixture before the broken cases', async () => {
  const { api, input } = await workerFixture();
  await expect(api.readActiveWorker(input)).resolves.toMatchObject({ mode: 'active', bindingCount: 12 });
});
it.each(workerReadbackCases)('classifies %s for %s', async (reason, _label, break_) => {
  const fixture = await workerFixture();
  const changed = break_(fixture);
  await expect(Promise.resolve().then(() => fixture.api.readActiveWorker({ ...fixture.input, ...changed })))
    .rejects.toMatchObject(readbackFailure(reason));
});
describe('a state close to a production wrangler deployment', () => {
  const wranglerFixture = async (
    environment: 'production' | 'staging',
    extraBindings: Record<string, unknown>[] = [],
  ) => {
    const wranglerIdentity = createTargetIdentity({
      environment,
      generation: 'fixture1',
      accountId: 'a'.repeat(32),
    });
    const terraformIds = {
      d1Id: '6f1c2a4e-1b7d-4c3a-9e5f-0a1b2c3d4e5f',
      kvId: '0123456789abcdef0123456789abcdef',
      queueId: 'f0e1d2c3b4a5968778695a4b3c2d1e0f',
      dlqId: '1f2e3d4c5b6a79880a9b8c7d6e5f4a3b',
    };
    const admissionEnvironment = {
      ORIGIN: `https://${environment}.test`,
      IORI_ADMISSION_MODE: 'active',
      IORI_ADMISSION_IDENTITY: JSON.stringify({
        environment,
        generation: 'fixture1',
        mainSha: 'a'.repeat(40),
        runId: 'run1',
        hostname: `${environment}.test`,
        workerHostname: `${wranglerIdentity.workerName}.fixture.workers.dev`,
        smoke: {
          username: 'iori-smoke',
          uploadFilename: '00000000-0000-4000-8000-000000000000.png',
          articleId: '00000000-0000-4000-8000-000000000000',
        },
      }),
    };
    const bindings = [
      { name: 'ASSETS', type: 'assets' },
      { name: 'DB', type: 'd1', id: terraformIds.d1Id },
      { name: 'FEDIFY_KV', type: 'kv_namespace', namespace_id: terraformIds.kvId },
      { name: 'FEDIFY_QUEUE', type: 'queue', queue_name: wranglerIdentity.names.queue },
      { name: 'UPLOADS', type: 'r2_bucket', bucket_name: wranglerIdentity.names.uploads },
      { name: 'IORI_ADMISSION_IDENTITY', type: 'plain_text', text: admissionEnvironment.IORI_ADMISSION_IDENTITY },
      { name: 'IORI_ADMISSION_MODE', type: 'plain_text', text: admissionEnvironment.IORI_ADMISSION_MODE },
      { name: 'ORIGIN', type: 'plain_text', text: admissionEnvironment.ORIGIN },
      { name: 'VAPID_SUBJECT', type: 'plain_text', text: 'mailto:operator@example.test' },
      { name: 'SMOKE_QUEUE_TOKEN', type: 'secret_text' },
      { name: 'VAPID_PRIVATE_KEY', type: 'secret_text' },
      { name: 'VAPID_PUBLIC_KEY', type: 'secret_text' },
      ...extraBindings,
    ];
    const versionIds = Array.from({ length: 6 }, (_, index) => `version-id-${6 - index}`);
    const deployment = (versionId: string, index: number) => ({
      id: `deployment-id-${index}`,
      source: 'wrangler',
      strategy: 'percentage',
      created_on: `2026-10-01T00:0${6 - index}:00.000000Z`,
      author_email: 'operator@example.test',
      annotations: { 'workers/triggered_by': index === 0 ? 'deployment' : 'secret' },
      versions: [{ version_id: versionId, percentage: 100 }],
    });
    const root = `/workers/scripts/${wranglerIdentity.workerName}`;
    const responses: Record<string, unknown> = {
      [`/d1/database/${terraformIds.d1Id}`]: { uuid: terraformIds.d1Id, name: wranglerIdentity.names.d1 },
      [`/storage/kv/namespaces/${terraformIds.kvId}`]: { id: terraformIds.kvId, title: wranglerIdentity.names.kv },
      [`/r2/buckets/${wranglerIdentity.names.uploads}`]: { name: wranglerIdentity.names.uploads },
      [`/r2/buckets/${wranglerIdentity.names.transfer}`]: { name: wranglerIdentity.names.transfer },
      [`/r2/buckets/${wranglerIdentity.names.transfer}/domains/managed`]: { enabled: false },
      ...Object.fromEntries(
        [[terraformIds.queueId, wranglerIdentity.names.queue], [terraformIds.dlqId, wranglerIdentity.names.dlq]].map((
          [queueId, queueName],
        ) => [`/queues/${queueId}`, {
          queue_id: queueId,
          queue_name: queueName,
          created_on: '2026-09-05T00:00:00Z',
          settings: { delivery_paused: queueId === terraformIds.dlqId },
          consumers: queueId === terraformIds.queueId
            ? [{
              type: 'worker',
              script: wranglerIdentity.workerName,
              dead_letter_queue: wranglerIdentity.names.dlq,
              consumer_id: 'consumer-id',
              settings: { batch_size: 1, max_wait_time_ms: 1000, max_retries: 3, retry_delay: 30 },
            }]
            : [],
          producers: [],
          consumers_total_count: queueId === terraformIds.queueId ? 1 : 0,
          producers_total_count: 0,
        }]),
      ),
      [`${root}/deployments`]: { deployments: versionIds.map(deployment) },
      [`${root}/versions/${versionIds[0]}`]: {
        id: versionIds[0],
        number: 6,
        metadata: {
          created_on: '2026-10-01T00:06:00.000000Z',
          modified_on: '2026-10-01T00:06:00.000000Z',
          source: 'wrangler',
          author_email: 'operator@example.test',
        },
        resources: {
          bindings,
          script: { etag: 'e'.repeat(64), handlers: ['fetch', 'queue'] },
          script_runtime: {
            compatibility_date: '2026-09-01',
            compatibility_flags: ['nodejs_compat'],
            usage_model: 'standard',
          },
        },
      },
      [`${root}/subdomain`]: { enabled: true, previews_enabled: false },
      [routesPath]: [{ script: wranglerIdentity.workerName, pattern: `${environment}.test/*` }],
    };
    const api = createTargetControlPlane({
      identity: wranglerIdentity,
      token: 'private-token',
      fetchRequest: async (url: URL) => {
        const path = url.pathname.replace(`/client/v4/accounts/${wranglerIdentity.accountId}`, '');
        const result = responses[path];
        return Response.json(result === undefined ? { success: false } : { success: true, result });
      },
    });
    const resources = await api.readActiveResources(terraformIds);
    return {
      api,
      input: {
        resources,
        admissionEnvironment,
        zoneId: 'zone1',
        expectedVersionId: versionIds[0]!,
        routePresent: true as const,
      },
    };
  };
  const stagingAccessToken = { name: 'STAGING_ACCESS_TOKEN', type: 'secret_text' };
  it('reads twelve bindings of production', async () => {
    const { api, input } = await wranglerFixture('production');
    await expect(api.readActiveWorker(input)).resolves.toMatchObject({ mode: 'active', bindingCount: 12 });
  });
  it('rejects the thirteen bindings of production that include STAGING_ACCESS_TOKEN', async () => {
    const { api, input } = await wranglerFixture('production', [stagingAccessToken]);
    await expect(api.readActiveWorker(input)).rejects.toMatchObject(readbackFailure('worker-binding-extra'));
  });
  it('accepts an AI binding without worker-binding-extra', async () => {
    const { api, input } = await wranglerFixture('production', [{ name: 'AI', type: 'ai' }]);
    await expect(api.readSealedWorker(input)).resolves.toMatchObject({ mode: 'sealed', bindingCount: 13 });
  });
  it('reads the same thirteen bindings of staging', async () => {
    const { api, input } = await wranglerFixture('staging', [stagingAccessToken]);
    await expect(api.readActiveWorker(input)).resolves.toMatchObject({ mode: 'active', bindingCount: 13 });
  });
});

it.each(['/queues/queue-id', '/queues/dlq-id'])(
  'rejects incomplete or mismatched Queue consumer/producer totals for %s',
  async (endpoint) => {
    for (const field of ['consumers_total_count', 'producers_total_count']) {
      const valid = ((resourceResponses() as unknown as Record<string, Record<string, unknown[]>>)[endpoint]![
        field.replace('_total_count', '')
      ]!).length;
      for (const count of [undefined, valid + 1, -1, String(valid)]) {
        const responses: Record<string, unknown> = resourceResponses();
        responses[endpoint] = { ...(responses[endpoint] as Record<string, unknown>), [field]: count };
        await expect(fixtureApi(responses).readActiveResources(ids)).rejects.toThrow('Target readback failed');
      }
    }
  },
);

describe('the resource readback names the conditions that differ', () => {
  const attachedResponses = (change: (consumer: Record<string, unknown>) => void = () => {}) => {
    const responses = resourceResponses();
    change(responses['/queues/queue-id'].consumers[0] as Record<string, unknown>);
    return responses;
  };
  const readAttached = (responses: Record<string, unknown>) => fixtureApi(responses).readActiveResources(ids);
  it('reads the attached state without a detail', async () => {
    await expect(readAttached(attachedResponses())).resolves.toMatchObject({ consumerId: 'consumer-id' });
  });
  it('reads a consumer that has only script, the key of the actual response', async () => {
    const responses = attachedResponses((consumer) => {
      delete consumer.script_name;
      consumer.script = identity.workerName;
    });
    await expect(readAttached(responses)).resolves.toMatchObject({ consumerId: 'consumer-id' });
  });
  it('reads a consumer that has only script_name', async () => {
    const responses = attachedResponses((consumer) => {
      consumer.script_name = consumer.script;
      delete consumer.script;
    });
    await expect(readAttached(responses)).resolves.toMatchObject({ consumerId: 'consumer-id' });
  });
  it('names resource-consumer-script when script is another Worker', async () => {
    const responses = attachedResponses((consumer) => {
      consumer.script = 'old-worker';
    });
    await expect(readAttached(responses)).rejects.toMatchObject(resourceFailure(['resource-consumer-script']));
  });
  it('prefers script over script_name', async () => {
    const responses = attachedResponses((consumer) => {
      consumer.script = 'old-worker';
      consumer.script_name = identity.workerName;
    });
    await expect(readAttached(responses)).rejects.toMatchObject(resourceFailure(['resource-consumer-script']));
  });
  it('names resource-consumer-script when only script_name is another Worker', async () => {
    const responses = attachedResponses((consumer) => {
      consumer.script_name = 'old-worker';
      delete consumer.script;
    });
    await expect(readAttached(responses)).rejects.toMatchObject(resourceFailure(['resource-consumer-script']));
  });
  it('names resource-consumer-script when neither script nor script_name is present', async () => {
    const responses = attachedResponses((consumer) => {
      delete consumer.script;
      delete consumer.script_name;
    });
    await expect(readAttached(responses)).rejects.toMatchObject(resourceFailure(['resource-consumer-script']));
  });
  it('names resource-input for an id of an invalid shape and for equal Queue ids', async () => {
    const api = fixtureApi(resourceResponses());
    await expect(api.readActiveResources({ ...ids, d1Id: 'bad id' })).rejects.toMatchObject(
      resourceFailure(['resource-input']),
    );
    await expect(api.readActiveResources({ ...ids, dlqId: ids.queueId })).rejects.toMatchObject(
      resourceFailure(['resource-input']),
    );
  });
  it.each<[string, string, (responses: ReturnType<typeof resourceResponses>) => void]>([
    ['resource-d1', 'a D1 name', (r) => {
      r['/d1/database/db-id'].name = 'old';
    }],
    ['resource-d1', 'a D1 uuid', (r) => {
      r['/d1/database/db-id'].uuid = 'other';
    }],
    ['resource-kv', 'a KV title', (r) => {
      r['/storage/kv/namespaces/kv-id'].title = 'old';
    }],
    ['resource-r2', 'an uploads bucket name', (r) => {
      r[`/r2/buckets/${identity.names.uploads}`].name = 'old';
    }],
    ['resource-r2', 'a transfer bucket name', (r) => {
      r[`/r2/buckets/${identity.names.transfer}`].name = 'old';
    }],
    ['resource-queue-identity', 'a Queue id', (r) => {
      r['/queues/queue-id'].queue_id = 'other';
    }],
    ['resource-queue-identity', 'a dead letter Queue name', (r) => {
      r['/queues/dlq-id'].queue_name = 'other';
    }],
    ['resource-queue-paused', 'a Queue that is paused', (r) => {
      r['/queues/queue-id'].settings.delivery_paused = true;
    }],
    ['resource-queue-paused', 'a dead letter Queue that is not paused', (r) => {
      r['/queues/dlq-id'].settings.delivery_paused = false;
    }],
    ['resource-queue-created', 'a Queue without created_on', (r) => {
      delete (r['/queues/queue-id'] as Partial<(typeof r)['/queues/queue-id']>).created_on;
    }],
    ['resource-queue-created', 'a Queue with a created_on that is not a date', (r) => {
      r['/queues/dlq-id'].created_on = 'yesterday';
    }],
    ['resource-dlq-attached', 'a producer of the dead letter Queue', (r) => {
      (r['/queues/dlq-id'].producers as unknown[]).push({ type: 'worker', script: identity.workerName });
      r['/queues/dlq-id'].producers_total_count = 1;
    }],
    ['resource-producer', 'a producer of another Worker', (r) => {
      (r['/queues/queue-id'].producers as unknown[]).push({ type: 'worker', script: 'old-worker' });
      r['/queues/queue-id'].producers_total_count = 1;
    }],
    ['resource-domain-public', 'a public managed domain', (r) => {
      r[`/r2/buckets/${identity.names.transfer}/domains/managed`].enabled = true;
    }],
  ])('names %s for %s', async (word, _label, change) => {
    const responses = resourceResponses();
    change(responses);
    await expect(fixtureApi(responses).readActiveResources(ids)).rejects.toMatchObject(resourceFailure([word]));
  });
  it.each(['consumers', 'producers'])('names resource-queue-shape for %s that are not an array', async (field) => {
    const responses = resourceResponses();
    (responses['/queues/queue-id'] as Record<string, unknown>)[field] = {};
    await expect(fixtureApi(responses).readActiveResources(ids)).rejects.toMatchObject(
      resourceFailure(['resource-queue-shape']),
    );
  });
  it.each([
    ['consumers_total_count', undefined],
    ['consumers_total_count', 2],
    ['producers_total_count', '0'],
    ['producers_total_count', 1],
  ])('names resource-queue-shape for a %s of %j', async (field, count) => {
    const responses = resourceResponses();
    (responses['/queues/queue-id'] as Record<string, unknown>)[field] = count;
    await expect(fixtureApi(responses).readActiveResources(ids)).rejects.toMatchObject(
      resourceFailure(['resource-queue-shape']),
    );
  });
  it('names resource-consumer-count for a consumer that is missing', async () => {
    const responses = resourceResponses();
    responses['/queues/queue-id'].consumers = [];
    responses['/queues/queue-id'].consumers_total_count = 0;
    await expect(readAttached(responses)).rejects.toMatchObject(resourceFailure(['resource-consumer-count']));
  });
  it.each<[string, string, (consumer: Record<string, unknown>) => void]>([
    ['resource-consumer-type', 'a consumer that is not a Worker', (c) => {
      c.type = 'http_pull';
    }],
    ['resource-consumer-script', 'a consumer of another Worker', (c) => {
      c.script = 'old-worker';
    }],
    ['resource-consumer-dlq', 'another dead letter Queue', (c) => {
      c.dead_letter_queue = 'other';
    }],
    ['resource-consumer-id', 'a missing consumer_id', (c) => {
      delete c.consumer_id;
    }],
    ['resource-consumer-id', 'a consumer_id of an invalid shape', (c) => {
      c.consumer_id = 'bad id';
    }],
    ['resource-consumer-settings', 'another batch_size', (c) => {
      (c.settings as Record<string, unknown>).batch_size = 10;
    }],
    ['resource-consumer-settings', 'another max_wait_time_ms', (c) => {
      (c.settings as Record<string, unknown>).max_wait_time_ms = 500;
    }],
    ['resource-consumer-settings', 'another max_retries', (c) => {
      (c.settings as Record<string, unknown>).max_retries = 5;
    }],
    ['resource-consumer-settings', 'another retry_delay', (c) => {
      (c.settings as Record<string, unknown>).retry_delay = 60;
    }],
    ['resource-consumer-settings', 'missing settings', (c) => {
      delete c.settings;
    }],
  ])('names %s for %s', async (word, _label, change) => {
    await expect(readAttached(attachedResponses(change))).rejects.toMatchObject(resourceFailure([word]));
  });
  it('keeps state-mismatch as the reason and lists every condition that differs, once each', async () => {
    const responses = attachedResponses((consumer) => {
      consumer.script = 'old-worker';
      consumer.settings = { batch_size: 1, max_wait_time_ms: 1000, max_retries: 3, retry_delay: 60 };
    });
    responses['/d1/database/db-id'].name = 'old';
    responses['/queues/queue-id'].settings.delivery_paused = true;
    responses['/queues/dlq-id'].settings.delivery_paused = false;
    const error = await readAttached(responses).then(() => undefined, (reason: unknown) => reason);
    expect(error).toMatchObject({
      message: 'Target readback failed.',
      diagnostic: {
        reason: 'state-mismatch',
        details: ['resource-d1', 'resource-queue-paused', 'resource-consumer-script', 'resource-consumer-settings'],
      },
    });
  });
  it('lists the conditions found so far when a later request fails', async () => {
    const responses = attachedResponses((consumer) => {
      consumer.script = 'old-worker';
    });
    delete (responses as Record<string, unknown>)[`/r2/buckets/${identity.names.transfer}/domains/managed`];
    await expect(readAttached(responses)).rejects.toMatchObject(resourceFailure(['resource-consumer-script']));
  });
  it('keeps the request failure when no condition differs', async () => {
    const responses = resourceResponses() as Record<string, unknown>;
    delete responses[`/r2/buckets/${identity.names.transfer}/domains/managed`];
    await expect(fixtureApi(responses).readActiveResources(ids)).rejects.toMatchObject(readbackFailure('r2-shape'));
  });
  it('names the same words in the active readback', async () => {
    const responses = attachedResponses((consumer) => {
      consumer.script = 'old-worker';
    });
    await expect(fixtureApi(responses).readActiveResources(ids)).rejects.toMatchObject(
      resourceFailure(['resource-consumer-script']),
    );
  });
});
