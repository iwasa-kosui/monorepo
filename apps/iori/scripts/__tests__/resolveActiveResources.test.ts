import { expect, it } from 'vitest';

import { assertWorkflowOutput } from '../assert-workflow-output.mjs';
import { createTargetIdentity } from '../fresh-target.mjs';
import { activeTargetFromResolvedIds, parseExpectedTarget } from '../migration-target-contract.mjs';
import { operationFailureLines } from '../operation-diagnostics.mjs';
import { createTargetControlPlane } from '../target-control-plane.mjs';
import { expectedTargetFixture } from './migrationTargetFixture.js';

const identity = createTargetIdentity({
  environment: 'production',
  generation: 'fixture1',
  accountId: 'a'.repeat(32),
});
const unrelated = (index: number) => ({
  d1: { uuid: `db-${index}`, name: `other-${index}` },
  kv: { id: `kv-${index}`, title: `other-${index}` },
  queue: { queue_id: `queue-${index}`, queue_name: `other-${index}` },
});
const consumer = (script: string, id: string) => ({ type: 'worker', script, consumer_id: id });
const resources = {
  d1: { uuid: 'db-id', name: identity.names.d1 },
  kv: { id: 'kv-id', title: identity.names.kv },
  queue: { queue_id: 'queue-id', queue_name: identity.names.queue },
  dlq: { queue_id: 'dlq-id', queue_name: identity.names.dlq },
};
type Pages = Record<string, unknown[][]>;
const pagesFor = (overrides: Partial<Pages> = {}): Pages => ({
  '/d1/database': [[resources.d1]],
  '/storage/kv/namespaces': [[resources.kv]],
  '/queues': [[resources.queue, resources.dlq]],
  ...overrides,
});
const api = (
  pages: Pages,
  { queue = { consumers: [consumer(identity.workerName, 'consumer-id')] }, status = 200 }: {
    queue?: unknown;
    status?: number;
  } = {},
) => {
  const calls: string[] = [];
  const control = createTargetControlPlane({
    identity,
    token: 'private-token',
    fetchRequest: async (url: URL) => {
      const path = url.pathname.replace(`/client/v4/accounts/${identity.accountId}`, '');
      calls.push(`${path}?${url.searchParams.toString()}`);
      if (status !== 200) return new Response('{}', { status });
      if (path === '/queues/queue-id') return Response.json({ success: true, result: queue });
      const list = pages[path];
      const page = Number(url.searchParams.get('page'));
      if (list === undefined || list[page - 1] === undefined) return Response.json({ success: false }, { status: 404 });
      return Response.json({
        success: true,
        result: list[page - 1],
        result_info: { page, per_page: 100, total_pages: list.length, total_count: list.flat().length },
      });
    },
  });
  return { control, calls };
};
const line = (reason: string) =>
  `IORI_DIAG stage=deploy-worker-resolve program=none exit=none signal=none reason=${reason}`;
const diagnose = async (promise: Promise<unknown>) => {
  const failure = await promise.then(() => undefined, (error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  const lines = operationFailureLines('deploy-worker-resolve', failure);
  for (const text of lines) expect(assertWorkflowOutput(text)).toEqual([]);
  return lines;
};
it('resolves the ids of the active generation by name', async () => {
  const { control, calls } = api(pagesFor());
  await expect(control.resolveActiveResources()).resolves.toEqual({
    d1Id: 'db-id',
    kvId: 'kv-id',
    queueId: 'queue-id',
    dlqId: 'dlq-id',
    consumerId: 'consumer-id',
  });
  expect(calls).toEqual([
    '/d1/database?per_page=100&page=1',
    '/storage/kv/namespaces?per_page=100&page=1',
    '/queues?per_page=100&page=1',
    '/queues/queue-id?',
  ]);
});
it('follows the pages until it finds the resource on the second page', async () => {
  const { control, calls } = api(pagesFor({
    '/d1/database': [[unrelated(1).d1], [resources.d1]],
    '/storage/kv/namespaces': [[unrelated(1).kv], [unrelated(2).kv], [resources.kv]],
  }));
  await expect(control.resolveActiveResources()).resolves.toMatchObject({ d1Id: 'db-id', kvId: 'kv-id' });
  expect(calls.filter(call => call.startsWith('/d1/database'))).toEqual([
    '/d1/database?per_page=100&page=1',
    '/d1/database?per_page=100&page=2',
  ]);
  expect(calls.filter(call => call.startsWith('/storage/kv/namespaces'))).toHaveLength(3);
});
it('follows a cursor when the API returns one', async () => {
  const requested: string[] = [];
  const control = createTargetControlPlane({
    identity,
    token: 'private-token',
    fetchRequest: async (url: URL) => {
      const path = url.pathname.replace(`/client/v4/accounts/${identity.accountId}`, '');
      requested.push(url.search);
      if (path === '/d1/database') {
        return Response.json(
          url.searchParams.has('cursor')
            ? { success: true, result: [resources.d1], result_info: { per_page: 100 } }
            : { success: true, result: [unrelated(1).d1], result_info: { per_page: 100, cursor: 'next page' } },
        );
      }
      if (path === '/storage/kv/namespaces') return Response.json({ success: true, result: [resources.kv] });
      if (path === '/queues') return Response.json({ success: true, result: [resources.queue, resources.dlq] });
      return Response.json({ success: true, result: { consumers: [consumer(identity.workerName, 'consumer-id')] } });
    },
  });
  await expect(control.resolveActiveResources()).resolves.toMatchObject({ d1Id: 'db-id' });
  expect(requested[1]).toBe('?per_page=100&cursor=next%20page');
});
it('stops at the page limit instead of looping forever', async () => {
  const forever = Array.from({ length: 30 }, (_, index) => [unrelated(index).d1]);
  const { control, calls } = api(pagesFor({ '/d1/database': forever }));
  const lines = await diagnose(control.resolveActiveResources());
  expect(calls.filter(call => call.startsWith('/d1/database'))).toHaveLength(20);
  expect(lines).toEqual([line('resolve-d1'), line('api-failed')]);
});
it.each([
  ['d1', '/d1/database'],
  ['kv', '/storage/kv/namespaces'],
  ['queue', '/queues'],
])('prints resource-missing for a %s that has no match', async (word, path) => {
  const empty = word === 'd1' ? unrelated(1).d1 : word === 'kv' ? unrelated(1).kv : unrelated(1).queue;
  const { control } = api(pagesFor({ [path]: [[empty]] }));
  expect(await diagnose(control.resolveActiveResources())).toEqual([line(`resolve-${word}`), line('resource-missing')]);
});
it('prints resource-missing for the dead letter queue when only the queue exists', async () => {
  const { control } = api(pagesFor({ '/queues': [[resources.queue]] }));
  expect(await diagnose(control.resolveActiveResources())).toEqual([line('resolve-dlq'), line('resource-missing')]);
});
it.each([
  ['d1', '/d1/database', resources.d1],
  ['kv', '/storage/kv/namespaces', resources.kv],
  ['queue', '/queues', resources.queue],
])('prints resource-ambiguous for two %s matches', async (word, path, match) => {
  const { control } = api(pagesFor({ [path]: [[match, { ...match }]] }));
  const lines = await diagnose(control.resolveActiveResources());
  expect(lines).toEqual([line(`resolve-${word}`), line('resource-ambiguous')]);
});
it('finds duplicates that sit on different pages', async () => {
  const { control } = api(pagesFor({ '/d1/database': [[resources.d1], [resources.d1]] }));
  expect(await diagnose(control.resolveActiveResources())).toEqual([line('resolve-d1'), line('resource-ambiguous')]);
});
it.each([401, 403])('prints api-forbidden for HTTP %i', async (status) => {
  const { control } = api(pagesFor(), { status });
  expect(await diagnose(control.resolveActiveResources())).toEqual([line('resolve-d1'), line('api-forbidden')]);
});
it('prints api-failed for any other API failure', async () => {
  const { control } = api(pagesFor(), { status: 500 });
  expect(await diagnose(control.resolveActiveResources())).toEqual([line('resolve-d1'), line('api-failed')]);
});
it('prints api-failed when a response has an unexpected shape', async () => {
  const control = createTargetControlPlane({
    identity,
    token: 'private-token',
    fetchRequest: async () => Response.json({ success: true, result: { not: 'a list' } }),
  });
  expect(await diagnose(control.resolveActiveResources())).toEqual([line('resolve-d1'), line('api-failed')]);
});
it.each([
  ['has no consumer', [], 'resource-missing'],
  ['has only a consumer of another Worker', [consumer('other-worker', 'other-id')], 'resource-missing'],
  [
    'has two consumers of the Worker',
    [consumer(identity.workerName, 'one'), consumer(identity.workerName, 'two')],
    'resource-ambiguous',
  ],
])('prints %s for a Queue that %s', async (_name, consumers, reason) => {
  const { control } = api(pagesFor(), { queue: { consumers } });
  expect(await diagnose(control.resolveActiveResources())).toEqual([line('resolve-consumer'), line(reason)]);
});
it('selects the consumer of the Worker among several consumers', async () => {
  const { control } = api(pagesFor(), {
    queue: {
      consumers: [consumer('other-worker', 'other-id'), {
        ...consumer('x', 'wanted'),
        script: undefined,
        script_name: identity.workerName,
      }],
    },
  });
  await expect(control.resolveActiveResources()).resolves.toMatchObject({ consumerId: 'wanted' });
});
it('prints api-failed for a Queue response without a consumer list', async () => {
  const { control } = api(pagesFor(), { queue: { queue_id: 'queue-id' } });
  expect(await diagnose(control.resolveActiveResources())).toEqual([line('resolve-consumer'), line('api-failed')]);
});
it('keeps names, ids and response bodies out of the printed lines', async () => {
  const { control } = api(pagesFor({ '/d1/database': [[unrelated(1).d1]] }));
  const text = (await diagnose(control.resolveActiveResources())).join('\n');
  for (const secret of [identity.names.d1, identity.accountId, 'private-token', 'db-1']) {
    expect(text).not.toContain(secret);
  }
});
it('leaves an aborted signal as aborted instead of classifying it as an API failure', async () => {
  const controller = new AbortController();
  const control = createTargetControlPlane({
    identity,
    token: 'private-token',
    signal: controller.signal,
    fetchRequest: async () => {
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    },
  });
  const failure = await control.resolveActiveResources().catch((error: unknown) => error);
  expect(operationFailureLines('deploy-worker-resolve', failure)).toEqual([line('aborted')]);
});
it('builds an active target without a backend bucket from the resolved ids', () => {
  const fixture = expectedTargetFixture();
  const { backend_bucket: _bucket, ...withoutBucket } = fixture.identity;
  const target = activeTargetFromResolvedIds({
    identity: createTargetIdentity({
      environment: 'production',
      generation: 'fixture1',
      accountId: 'a'.repeat(32),
    }),
    mainSha: fixture.identity.main_sha,
    runId: fixture.identity.run_id,
    admission: fixture.admission,
    resolved: { d1Id: 'db', kvId: 'kv', queueId: 'queue', dlqId: 'dlq', consumerId: 'consumer' },
  });
  expect(target).toEqual({ ...fixture, identity: withoutBucket });
  expect(parseExpectedTarget(target, { backend: false })).toEqual(target);
  expect(() => parseExpectedTarget(target)).toThrow();
  expect(() => parseExpectedTarget(fixture, { backend: false })).toThrow();
});
