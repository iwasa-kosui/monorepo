import { createTargetIdentity } from './fresh-target.mjs';
import { parseAdmission } from '../src/workerAdmission.ts';

const fail = () => {
  throw new Error('Target readback failed.');
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const safeId = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
/** REST is used here only by the protected operator, never in the Worker graph. All responses stay private. */
export const createTargetControlPlane = ({ identity: supplied, token, fetchRequest = fetch }) => {
  const identity = createTargetIdentity(supplied);
  if (typeof token !== 'string' || token.length === 0) fail();
  const root = `/accounts/${identity.accountId}`;
  const get = async (path) => {
    try {
      const response = await fetchRequest(new URL(`https://api.cloudflare.com/client/v4${path}`), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) fail();
      // Bounded body even when Content-Length is absent or dishonest.
      const reader = response.body?.getReader();
      if (!reader) fail();
      const chunks = [];
      let size = 0;
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        size += item.value.byteLength;
        if (size > 2_000_000) {
          await reader.cancel();
          fail();
        }
        chunks.push(item.value);
      }
      const body = JSON.parse(await new Blob(chunks).text());
      if (body.success !== true || body.result === undefined) fail();
      return body;
    } catch {
      fail();
    }
  };
  const list = async (path, pagination) => {
    const body = await get(path);
    const items = pagination === 'cursor' ? body.result.buckets : body.result;
    if (
      !Array.isArray(items) || items.length >= 100 || body.result_info?.cursor || body.result.cursor
      || body.result.truncated === true
    ) fail();
    if (pagination !== 'none') {
      const info = body.result_info;
      if (!info || !Number.isInteger(info.per_page) || info.per_page < 1 || items.length > info.per_page) fail();
      if (pagination === 'cursor') {
        if (items.length >= info.per_page) fail();
      } else {
        if (
          !Number.isInteger(info.total_count) || info.total_count !== items.length || info.page !== 1
          || (info.count !== undefined && info.count !== items.length)
        ) fail();
        // D1 and KV expose count/page/per_page/total_count; total_pages is Queue-specific.
        if (
          pagination === 'queue'
          && (!Number.isInteger(info.total_pages) || info.total_pages < 0 || info.total_pages > 1)
        ) fail();
      }
    }
    return items;
  };
  const assertFresh = async () => {
    const specs = [
      [`${root}/workers/scripts`, 'id', [identity.workerName], 'none'],
      [`${root}/d1/database?per_page=100&page=1`, 'name', [identity.names.d1], 'offset'],
      [`${root}/storage/kv/namespaces?per_page=100&page=1`, 'title', [identity.names.kv], 'offset'],
      [`${root}/queues?per_page=100&page=1`, 'queue_name', [identity.names.queue, identity.names.dlq], 'queue'],
      [`${root}/r2/buckets?per_page=100`, 'name', [identity.names.uploads, identity.names.transfer], 'cursor'],
    ];
    for (const [path, key, names, pagination] of specs) {
      const items = await list(path, pagination);
      if (items.some((item) => typeof item?.[key] !== 'string' || names.includes(item[key]))) fail();
    }
    return { fresh: true, resourceCount: 0 };
  };
  const readResources = async ({ d1Id, kvId, queueId, dlqId, consumerAttached = false }) => {
    if (![d1Id, kvId, queueId, dlqId].every(safeId) || queueId === dlqId) fail();
    const [d1, kv, uploads, transfer, queue, dlq] = await Promise.all([
      get(`${root}/d1/database/${d1Id}`),
      get(`${root}/storage/kv/namespaces/${kvId}`),
      get(`${root}/r2/buckets/${identity.names.uploads}`),
      get(`${root}/r2/buckets/${identity.names.transfer}`),
      get(`${root}/queues/${queueId}`),
      get(`${root}/queues/${dlqId}`),
    ]).then((values) => values.map((value) => value.result));
    if (
      d1.uuid !== d1Id || d1.name !== identity.names.d1 || kv.id !== kvId || kv.title !== identity.names.kv
      || uploads.name !== identity.names.uploads || transfer.name !== identity.names.transfer
    ) fail();
    for (const [q, id, name] of [[queue, queueId, identity.names.queue], [dlq, dlqId, identity.names.dlq]]) {
      if (
        q.queue_id !== id || q.queue_name !== name || q.settings?.delivery_paused !== true
        || !Array.isArray(q.consumers) || !Array.isArray(q.producers)
        || !Number.isInteger(q.consumers_total_count) || q.consumers_total_count !== q.consumers.length
        || !Number.isInteger(q.producers_total_count) || q.producers_total_count !== q.producers.length
      ) fail();
      if (!q.created_on || !Number.isFinite(Date.parse(q.created_on))) fail();
    }
    if (
      dlq.consumers.length !== 0 || dlq.producers.length !== 0 || queue.consumers.length !== Number(consumerAttached)
    ) fail();
    if (queue.producers.some((producer) => producer.type !== 'worker' || producer.script !== identity.workerName)) {
      fail();
    }
    if (consumerAttached) {
      const consumer = queue.consumers[0];
      if (
        consumer.type !== 'worker' || consumer.script_name !== identity.workerName
        || consumer.dead_letter_queue !== identity.names.dlq || !safeId(consumer.consumer_id)
        || consumer.settings?.batch_size !== 1 || consumer.settings?.max_wait_time_ms !== 1000
        || consumer.settings?.max_retries !== 3 || consumer.settings?.retry_delay !== 30
      ) fail();
    }
    const publicAccess = (await get(`${root}/r2/buckets/${identity.names.transfer}/domains/managed`)).result;
    if (publicAccess.enabled !== false) fail();
    return {
      identity,
      d1Id,
      kvId,
      queueId,
      dlqId,
      queueCreatedOn: queue.created_on,
      dlqCreatedOn: dlq.created_on,
      queueSettings: queue.settings,
      consumerId: queue.consumers[0]?.consumer_id ?? null,
      queuePaused: true,
    };
  };
  const readWorkerAdmission = async (
    { resources, admissionEnvironment, zoneId, expectedVersionId, routePresent = false },
  ) => {
    if (typeof routePresent !== 'boolean') fail();
    if (!same(resources?.identity, identity) || resources.queuePaused !== true) fail();
    const admission = parseAdmission(admissionEnvironment);
    if (
      !admission || admission.environment !== identity.environment
      || admission.generation !== identity.generation || !safeId(zoneId) || !safeId(expectedVersionId)
    ) fail();
    const script = `${root}/workers/scripts/${identity.workerName}`;
    const [deployments, version, subdomain, routes] = await Promise.all([
      get(`${script}/deployments`),
      get(`${script}/versions/${expectedVersionId}`),
      get(`${script}/subdomain`),
      get(`/zones/${zoneId}/workers/routes`),
    ]).then((items) => items.map((item) => item.result));
    if (
      !Array.isArray(deployments.deployments)
      || (deployments.deployments[0]?.versions?.length !== 1
        || deployments.deployments[0].versions[0].percentage !== 100
        || deployments.deployments[0].versions[0].version_id !== expectedVersionId)
      || version.id !== expectedVersionId || subdomain.enabled !== true || subdomain.previews_enabled !== false
      || !Array.isArray(routes)
      || routes.filter((route) => route.script === identity.workerName).length !== Number(routePresent)
      || routes.some((route) => route.script === identity.workerName && route.pattern !== `${admission.hostname}/*`)
    ) fail();
    const bindings = version.resources?.bindings;
    if (!Array.isArray(bindings) || new Set(bindings.map((b) => b.name)).size !== bindings.length) fail();
    const expected = [
      { name: 'DB', type: 'd1', id: resources.d1Id },
      { name: 'UPLOADS', type: 'r2_bucket', bucket_name: identity.names.uploads },
      { name: 'FEDIFY_KV', type: 'kv_namespace', namespace_id: resources.kvId },
      { name: 'FEDIFY_QUEUE', type: 'queue', queue_name: identity.names.queue },
      { name: 'ASSETS', type: 'assets' },
      ...['IORI_ADMISSION_MODE', 'IORI_ADMISSION_IDENTITY', 'ORIGIN'].map((name) => ({
        name,
        type: 'plain_text',
        text: admissionEnvironment[name],
      })),
    ];
    if (
      expected.some((entry) =>
        !bindings.some((binding) => Object.entries(entry).every(([key, value]) => binding[key] === value))
      )
    ) fail();
    const extraNames = new Set([
      'VAPID_SUBJECT',
      'VAPID_PUBLIC_KEY',
      'VAPID_PRIVATE_KEY',
      'SMOKE_QUEUE_TOKEN',
      ...(identity.environment === 'staging' ? ['STAGING_ACCESS_TOKEN'] : []),
    ]);
    if (
      bindings.some((binding) => !expected.some((item) => item.name === binding.name) && !extraNames.has(binding.name))
    ) fail();
    for (
      const name of [
        'VAPID_PUBLIC_KEY',
        'VAPID_PRIVATE_KEY',
        'SMOKE_QUEUE_TOKEN',
        ...(identity.environment === 'staging' ? ['STAGING_ACCESS_TOKEN'] : []),
      ]
    ) {
      if (!bindings.some((binding) => binding.name === name && binding.type === 'secret_text')) fail();
    }
    // Return only reviewed metadata: never secret values or the raw version bindings.
    return {
      versionId: expectedVersionId,
      workerName: identity.workerName,
      mode: admission.mode,
      previewsEnabled: false,
      routeCount: Number(routePresent),
      bindingCount: bindings.length,
    };
  };
  const readSealedWorker = async (input) => {
    if (input.admissionEnvironment?.IORI_ADMISSION_MODE !== 'sealed') fail();
    return readWorkerAdmission(input);
  };
  const readQueuePause = async ({ queueId, paused }) => {
    if (!safeId(queueId) || typeof paused !== 'boolean') fail();
    const queue = (await get(`${root}/queues/${queueId}`)).result;
    if (
      queue.queue_id !== queueId || queue.queue_name !== identity.names.queue
      || queue.settings?.delivery_paused !== paused
    ) fail();
    return { queueId, paused };
  };
  return Object.freeze({ assertFresh, readResources, readSealedWorker, readWorkerAdmission, readQueuePause });
};
