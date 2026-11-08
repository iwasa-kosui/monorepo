import { parseAdmission } from '../src/workerAdmission.ts';
import { createTargetIdentity } from './fresh-target.mjs';
import { controlPlaneApi } from './target-preparation-diagnostics.mjs';

const fail = (reason, details) => {
  throw Object.assign(new Error('Target readback failed.'), {
    diagnostic: { reason, ...(details?.length ? { details } : {}) },
  });
};
const failApi = (path, kind) => fail(`${controlPlaneApi(path)}-${kind}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const RESOLVE_PAGE_SIZE = 100;
const RESOLVE_MAX_PAGES = 20;
const resolveFailure = (reason, word) =>
  Object.assign(new Error('Active resource resolution failed.'), {
    diagnostic: { reason, details: [`resolve-${word}`] },
  });
const safeId = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
/** REST is used here only by the protected operator, never in the Worker graph. All responses stay private. */
export const createTargetControlPlane = ({ identity: supplied, token, fetchRequest = fetch, signal }) => {
  const identity = createTargetIdentity(supplied);
  if (typeof token !== 'string' || token.length === 0) fail('config-invalid');
  const root = `/accounts/${identity.accountId}`;
  const get = async (path) => {
    try {
      const response = await fetchRequest(new URL(`https://api.cloudflare.com/client/v4${path}`), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
      });
      if (!response.ok) failApi(path, `http-${response.status}`);
      // Bounded body even when Content-Length is absent or dishonest.
      const reader = response.body?.getReader();
      if (!reader) failApi(path, 'shape');
      const chunks = [];
      let size = 0;
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        size += item.value.byteLength;
        if (size > 2_000_000) {
          await reader.cancel();
          failApi(path, 'too-large');
        }
        chunks.push(item.value);
      }
      let body;
      try {
        body = JSON.parse(await new Blob(chunks).text());
      } catch {
        failApi(path, 'shape');
      }
      if (body.success !== true || body.result === undefined) failApi(path, 'shape');
      return body;
    } catch (error) {
      if (error?.diagnostic || signal?.aborted) throw error;
      failApi(path, 'request');
    }
  };
  const pagedItems = async (path) => {
    const items = [];
    let cursor;
    for (let page = 1; page <= RESOLVE_MAX_PAGES; page += 1) {
      const query = cursor === undefined
        ? `per_page=${RESOLVE_PAGE_SIZE}&page=${page}`
        : `per_page=${RESOLVE_PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`;
      const body = await get(`${path}?${query}`);
      const info = body.result_info;
      if (!Array.isArray(body.result) || (info !== undefined && (info === null || typeof info !== 'object'))) {
        failApi(path, 'shape');
      }
      items.push(...body.result);
      if (body.result.length === 0) return items;
      if (typeof info?.cursor === 'string' && info.cursor !== '') cursor = info.cursor;
      else if (Number.isInteger(info?.total_pages)) {
        if (page >= info.total_pages) return items;
      } else if (Number.isInteger(info?.total_count)) {
        if (items.length >= info.total_count) return items;
      } else if (body.result.length < (info?.per_page ?? RESOLVE_PAGE_SIZE)) return items;
    }
    return failApi(path, 'limit');
  };
  const guardedResolve = async (word, read) => {
    try {
      return await read();
    } catch (error) {
      if (signal?.aborted) throw error;
      const status = /-http-(\d{3})$/.exec(error?.diagnostic?.reason ?? '')?.[1];
      throw resolveFailure(status === '401' || status === '403' ? 'api-forbidden' : 'api-failed', word);
    }
  };
  const pickOne = (items, matches, idKey, word) => {
    if (items.some((item) => item === null || typeof item !== 'object')) throw resolveFailure('api-failed', word);
    const found = items.filter(matches);
    if (found.length === 0) throw resolveFailure('resource-missing', word);
    if (found.length > 1) throw resolveFailure('resource-ambiguous', word);
    if (!safeId(found[0][idKey])) throw resolveFailure('api-failed', word);
    return found[0][idKey];
  };
  const resolveActiveResources = async () => {
    const d1Items = await guardedResolve('d1', () => pagedItems(`${root}/d1/database`));
    const d1Id = pickOne(d1Items, (item) => item.name === identity.names.d1, 'uuid', 'd1');
    const kvItems = await guardedResolve('kv', () => pagedItems(`${root}/storage/kv/namespaces`));
    const kvId = pickOne(kvItems, (item) => item.title === identity.names.kv, 'id', 'kv');
    const queueItems = await guardedResolve('queue', () => pagedItems(`${root}/queues`));
    const queueId = pickOne(queueItems, (item) => item.queue_name === identity.names.queue, 'queue_id', 'queue');
    const dlqId = pickOne(queueItems, (item) => item.queue_name === identity.names.dlq, 'queue_id', 'dlq');
    const queue = await guardedResolve('consumer', async () => (await get(`${root}/queues/${queueId}`)).result);
    if (!Array.isArray(queue?.consumers)) throw resolveFailure('api-failed', 'consumer');
    const consumerId = pickOne(
      queue.consumers,
      (consumer) => (consumer.script === undefined ? consumer.script_name : consumer.script) === identity.workerName,
      'consumer_id',
      'consumer',
    );
    return { d1Id, kvId, queueId, dlqId, consumerId };
  };
  const readResourceState = async ({ d1Id, kvId, queueId, dlqId, consumerAttached = false }) => {
    if (![d1Id, kvId, queueId, dlqId].every(safeId) || queueId === dlqId) fail('state-mismatch', ['resource-input']);
    const [d1, kv, uploads, eventArchive, transfer, queue, dlq] = await Promise.all([
      get(`${root}/d1/database/${d1Id}`),
      get(`${root}/storage/kv/namespaces/${kvId}`),
      get(`${root}/r2/buckets/${identity.names.uploads}`),
      get(`${root}/r2/buckets/${identity.names.eventArchive}`),
      get(`${root}/r2/buckets/${identity.names.transfer}`),
      get(`${root}/queues/${queueId}`),
      get(`${root}/queues/${dlqId}`),
    ]).then((values) => values.map((value) => value.result));
    const details = [];
    const note = (word) => {
      if (!details.includes(word)) details.push(word);
    };
    if (d1.uuid !== d1Id || d1.name !== identity.names.d1) note('resource-d1');
    if (kv.id !== kvId || kv.title !== identity.names.kv) note('resource-kv');
    if (
      uploads.name !== identity.names.uploads || eventArchive.name !== identity.names.eventArchive
      || transfer.name !== identity.names.transfer
    ) note('resource-r2');
    for (const [q, id, name] of [[queue, queueId, identity.names.queue], [dlq, dlqId, identity.names.dlq]]) {
      if (q.queue_id !== id || q.queue_name !== name) note('resource-queue-identity');
      if (q.settings?.delivery_paused !== (id !== queueId)) note('resource-queue-paused');
      if (
        !Array.isArray(q.consumers) || !Array.isArray(q.producers)
        || !Number.isInteger(q.consumers_total_count) || q.consumers_total_count !== q.consumers.length
        || !Number.isInteger(q.producers_total_count) || q.producers_total_count !== q.producers.length
      ) note('resource-queue-shape');
      if (!q.created_on || !Number.isFinite(Date.parse(q.created_on))) note('resource-queue-created');
    }
    if (details.includes('resource-queue-shape')) fail('state-mismatch', details);
    if (dlq.consumers.length !== 0 || dlq.producers.length !== 0) note('resource-dlq-attached');
    if (queue.consumers.length !== Number(consumerAttached)) note('resource-consumer-count');
    if (queue.producers.some((producer) => producer.type !== 'worker' || producer.script !== identity.workerName)) {
      note('resource-producer');
    }
    if (consumerAttached && queue.consumers.length === 1) {
      const consumer = queue.consumers[0];
      if (consumer.type !== 'worker') note('resource-consumer-type');
      const consumerScript = consumer.script === undefined ? consumer.script_name : consumer.script;
      if (consumerScript !== identity.workerName) note('resource-consumer-script');
      if (consumer.dead_letter_queue !== identity.names.dlq) note('resource-consumer-dlq');
      if (!safeId(consumer.consumer_id)) note('resource-consumer-id');
      if (
        consumer.settings?.batch_size !== 1 || consumer.settings?.max_wait_time_ms !== 1000
        || consumer.settings?.max_retries !== 3 || consumer.settings?.retry_delay !== 30
      ) note('resource-consumer-settings');
    }
    const publicAccess = await get(`${root}/r2/buckets/${identity.names.transfer}/domains/managed`).then(
      (body) => body.result,
      (error) => {
        if (details.length === 0 || signal?.aborted) throw error;
      },
    );
    if (publicAccess !== undefined && publicAccess.enabled !== false) note('resource-domain-public');
    if (details.length > 0) fail('state-mismatch', details);
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
      queuePaused: false,
      queueConfiguration: { settings: queue.settings, consumers: queue.consumers, producers: queue.producers },
      dlqConfiguration: { settings: dlq.settings, consumers: dlq.consumers, producers: dlq.producers },
    };
  };
  const readWorkerState = async (
    { resources, admissionEnvironment, zoneId, expectedVersionId, routePresent = false, missingAllowed = [] },
  ) => {
    if (typeof routePresent !== 'boolean') fail('worker-input');
    if (!same(resources?.identity, identity) || resources.queuePaused !== false) fail('worker-resources');
    const admission = parseAdmission(admissionEnvironment);
    if (
      !admission || admission.environment !== identity.environment
      || admission.generation !== identity.generation || !safeId(zoneId) || !safeId(expectedVersionId)
    ) fail('worker-input');
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
    ) fail('worker-deployment');
    if (version.id !== expectedVersionId) fail('worker-version');
    if (subdomain.enabled !== true || subdomain.previews_enabled !== false) fail('worker-subdomain');
    if (
      !Array.isArray(routes)
      || routes.filter((route) => route.script === identity.workerName).length !== Number(routePresent)
      || routes.some((route) => route.script === identity.workerName && route.pattern !== `${admission.hostname}/*`)
    ) fail('worker-route');
    const bindings = version.resources?.bindings;
    if (!Array.isArray(bindings) || new Set(bindings.map((b) => b.name)).size !== bindings.length) {
      fail('worker-bindings-shape');
    }
    const expected = [
      { name: 'DB', type: 'd1', id: resources.d1Id },
      { name: 'UPLOADS', type: 'r2_bucket', bucket_name: identity.names.uploads },
      { name: 'EVENT_ARCHIVE', type: 'r2_bucket', bucket_name: identity.names.eventArchive },
      { name: 'FEDIFY_KV', type: 'kv_namespace', namespace_id: resources.kvId },
      { name: 'FEDIFY_QUEUE', type: 'queue', queue_name: identity.names.queue },
      { name: 'ASSETS', type: 'assets' },
      ...['IORI_ADMISSION_MODE', 'IORI_ADMISSION_IDENTITY', 'ORIGIN'].map((name) => ({
        name,
        type: 'plain_text',
        text: admissionEnvironment[name],
      })),
    ];
    for (const entry of expected) {
      const present = bindings.some((binding) => binding.name === entry.name);
      if (!present && missingAllowed.includes(entry.name)) continue;
      if (!present) fail('worker-binding-missing');
      if (!bindings.some((binding) => Object.entries(entry).every(([key, value]) => binding[key] === value))) {
        fail('worker-binding-mismatch');
      }
    }
    const extraNames = new Set([
      'VAPID_SUBJECT',
      'EVENT_ARCHIVE_ENABLED',
      'IORI_PRUNE_FEDERATED_POSTS',
      'VAPID_PUBLIC_KEY',
      'VAPID_PRIVATE_KEY',
      'SMOKE_QUEUE_TOKEN',
      ...(identity.environment === 'staging' ? ['STAGING_ACCESS_TOKEN'] : []),
    ]);
    if (bindings.some((binding) => binding.name === 'AI' && binding.type !== 'ai')) fail('worker-binding-mismatch');
    if (
      bindings.some((binding) =>
        !expected.some((item) => item.name === binding.name) && binding.name !== 'AI' && !extraNames.has(binding.name)
      )
    ) fail('worker-binding-extra');
    for (
      const name of [
        'VAPID_PUBLIC_KEY',
        'VAPID_PRIVATE_KEY',
        'SMOKE_QUEUE_TOKEN',
        ...(identity.environment === 'staging' ? ['STAGING_ACCESS_TOKEN'] : []),
      ]
    ) {
      if (!bindings.some((binding) => binding.name === name && binding.type === 'secret_text')) {
        fail('worker-secret-missing');
      }
    }
    // Return only reviewed metadata: never secret values or the raw version bindings.
    return {
      versionId: expectedVersionId,
      workerName: identity.workerName,
      mode: admission.mode,
      previewsEnabled: false,
      routeCount: Number(routePresent),
      routeConfiguration: routes.filter(route => route.script === identity.workerName),
      bindingCount: bindings.length,
    };
  };
  const readActiveResources = (input) => readResourceState({ ...input, consumerAttached: true });
  const readActiveWorker = (input) => {
    if (input.admissionEnvironment?.IORI_ADMISSION_MODE !== 'active' || input.routePresent !== true) {
      fail('state-mismatch');
    }
    return readWorkerState(input);
  };
  const readCurrentVersion = async () => {
    const deployments = (await get(`${root}/workers/scripts/${identity.workerName}/deployments`)).result;
    const versions = deployments?.deployments?.[0]?.versions;
    if (
      !Array.isArray(versions) || versions.length !== 1 || versions[0].percentage !== 100
      || !safeId(versions[0].version_id)
    ) fail('state-mismatch');
    return versions[0].version_id;
  };
  return Object.freeze({
    resolveActiveResources,
    readActiveResources,
    readActiveWorker,
    readCurrentVersion,
  });
};
