import { isDeepStrictEqual } from 'node:util';

import { planRejectionDetails, planResourceWord } from './target-preparation-diagnostics.mjs';

const QUEUE_ATTRIBUTES = [
  'id',
  'queue_id',
  'queue_name',
  'account_id',
  'created_on',
  'modified_on',
  'settings.delivery_paused',
  'settings.delivery_delay',
  'settings.message_retention_period',
  'consumers',
  'consumers_total_count',
  'producers',
  'producers_total_count',
];
const BUCKET_ATTRIBUTES = ['id', 'name', 'account_id', 'location', 'jurisdiction', 'storage_class', 'creation_date'];
const ATTRIBUTE_PATHS = Object.freeze({
  d1: [
    'id',
    'uuid',
    'name',
    'account_id',
    'created_at',
    'file_size',
    'num_tables',
    'version',
    'jurisdiction',
    'primary_location_hint',
    'read_replication.mode',
  ],
  uploads: BUCKET_ATTRIBUTES,
  kv: ['id', 'title', 'account_id', 'supports_url_encoding'],
  queue: QUEUE_ATTRIBUTES,
  dlq: QUEUE_ATTRIBUTES,
  transfer: BUCKET_ATTRIBUTES,
  'transfer-domain': ['account_id', 'bucket_id', 'bucket_name', 'enabled', 'domain', 'jurisdiction'],
  consumer: [
    'consumer_id',
    'queue_id',
    'queue_name',
    'account_id',
    'script_name',
    'type',
    'dead_letter_queue',
    'created_on',
    'settings.batch_size',
    'settings.max_wait_time_ms',
    'settings.max_retries',
    'settings.retry_delay',
    'settings.max_concurrency',
    'settings.visibility_timeout_ms',
  ],
  route: ['id', 'zone_id', 'pattern', 'script'],
  other: [],
});
const attributeWord = (path) => path.replace(/^settings\./, '').replaceAll('.', '-').replaceAll('_', '-');
const ATTRIBUTE_TABLE = Object.freeze(
  Object.fromEntries(
    Object.entries(ATTRIBUTE_PATHS).map(([resource, paths]) => [
      resource,
      Object.freeze(Object.fromEntries(paths.map((path) => [path, attributeWord(path)]))),
    ]),
  ),
);
export const ADOPT_ATTRIBUTE_WORDS = Object.freeze(
  Object.fromEntries(
    Object.entries(ATTRIBUTE_TABLE).map(([resource, table]) => [
      resource,
      Object.freeze([...new Set(Object.values(table)), 'other', 'more']),
    ]),
  ),
);
const ATTRIBUTE_PREFIXES = Object.freeze(['drift', 'diff']);
const ATTRIBUTE_DETAILS = new Set(
  ATTRIBUTE_PREFIXES.flatMap((prefix) =>
    Object.entries(ADOPT_ATTRIBUTE_WORDS).flatMap(([resource, words]) =>
      words.map((word) => `${prefix}-${resource}-${word}`)
    )
  ),
);
export const isAdoptPlanDetail = (detail) => typeof detail === 'string' && ATTRIBUTE_DETAILS.has(detail);
const MAX_ATTRIBUTE_LINES = 8;
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const changedPaths = (before, after, prefix = '') => {
  if (isRecord(before) && isRecord(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().flatMap((key) =>
      changedPaths(before[key], after[key], prefix === '' ? key : `${prefix}.${key}`)
    );
  }
  return isDeepStrictEqual(before, after) ? [] : [prefix];
};
const attributeWords = (address, before, after) => {
  const table = ATTRIBUTE_TABLE[planResourceWord(address)];
  const words = [
    ...new Set(
      changedPaths(before, after).map((path) => Object.hasOwn(table, path) ? table[path] : 'other'),
    ),
  ];
  return words.length > MAX_ATTRIBUTE_LINES ? [...words.slice(0, MAX_ATTRIBUTE_LINES - 1), 'more'] : words;
};
export const adoptPlanDetails = (issues, prefix) => {
  if (!ATTRIBUTE_PREFIXES.includes(prefix)) throw new Error('Invalid plan detail prefix.');
  return [
    ...planRejectionDetails(issues),
    ...new Set(
      issues.flatMap((issue) =>
        issue.address === undefined
          ? []
          : (issue.attributes ?? []).map((word) => `${prefix}-${planResourceWord(issue.address)}-${word}`)
      ),
    ),
  ];
};
const noop = (change) => change?.actions?.length === 1 && change.actions[0] === 'no-op';
const unchanged = (change) => noop(change) && !change.importing && isDeepStrictEqual(change.before, change.after);
const unchangedIssues = (changes, message) =>
  changes.filter((item) => !unchanged(item.change)).map((item) => ({
    message,
    address: item.address,
    actions: item.change?.actions,
    attributes: attributeWords(item.address, item.change?.before, item.change?.after),
  }));
export const COMPUTED_ONLY_PATHS = Object.freeze({
  'cloudflare_d1_database.iori': ['file_size', 'num_tables', 'version'],
  'cloudflare_queue.fedify': [
    'consumers',
    'consumers_total_count',
    'modified_on',
    'producers',
    'producers_total_count',
  ],
});
const PAUSE_PATH = 'settings.delivery_paused';
const computedOnlyPath = (paths, path) => paths.some((allowed) => path === allowed || path.startsWith(`${allowed}.`));
const allowedDrift = ({ address, change }) => {
  if (
    !Object.hasOwn(COMPUTED_ONLY_PATHS, address) || change?.actions?.length !== 1 || change.actions[0] !== 'update'
  ) {
    return false;
  }
  const paths = changedPaths(change.before, change.after);
  return paths.every((path) =>
    computedOnlyPath(COMPUTED_ONLY_PATHS[address], path)
    || (address === 'cloudflare_queue.fedify' && path === PAUSE_PATH
      && change.before.settings.delivery_paused === true && change.after.settings.delivery_paused === false)
  );
};
export const inspectRefreshPlan = (plan) => {
  const changes = plan?.resource_changes ?? [];
  const drift = plan?.resource_drift ?? [];
  if (!isRecord(plan) || !Array.isArray(changes) || !Array.isArray(drift)) {
    return [{ message: 'Refresh plan state is invalid' }];
  }
  return [
    ...unchangedIssues(changes, 'Refresh plan must not change resources'),
    ...drift.filter((item) => !allowedDrift(item)).map((item) => ({
      message: 'Refresh drift is not allowed',
      address: item.address,
      actions: item.change?.actions,
      attributes: attributeWords(item.address, item.change?.before, item.change?.after),
    })),
  ];
};
const ROUTE_ATTRIBUTES = [['zone_id', 'zone-id'], ['pattern', 'pattern'], ['script', 'script']];
export const inspectAdoptedPlan = (plan, { hostname, workerName, zoneId }) => {
  const changes = plan?.resource_changes;
  if (!isRecord(plan) || !Array.isArray(changes)) return [{ message: 'Resource state is required' }];
  const issues = unchangedIssues(changes, 'Adopted plan must not change resources');
  const outputs = isRecord(plan.output_changes) ? Object.values(plan.output_changes) : [];
  if (outputs.some((change) => !noop(change))) issues.push({ message: 'Outputs must not change' });
  const routes = changes.filter((item) => /^cloudflare_workers?_route\./.test(item.address));
  const route = routes[0];
  const expected = { zone_id: zoneId, pattern: `${hostname}/*`, script: workerName };
  if (
    routes.length !== 1 || route.address !== 'cloudflare_workers_route.iori[0]'
    || ROUTE_ATTRIBUTES.some(([key]) =>
      route.change?.after?.[key] !== expected[key] || route.change.after_unknown?.[key] === true
    )
  ) {
    issues.push({
      message: 'Only the selected route may be adopted',
      ...(routes.length === 1
        ? {
          address: route.address,
          actions: route.change?.actions,
          attributes: ROUTE_ATTRIBUTES.filter(([key]) => route.change?.after?.[key] !== expected[key]).map((
            [, word],
          ) => word),
        }
        : {}),
    });
  }
  for (const [name, paused] of [['fedify', false], ['fedify_dlq', true]]) {
    const address = `cloudflare_queue.${name}`;
    const queue = changes.find((item) => item.address === address)?.change;
    if (queue?.after?.settings?.delivery_paused !== paused) {
      issues.push({
        message: paused ? 'Dead Letter Queue must remain paused' : 'Queue must be active',
        address,
        ...(queue ? { actions: queue.actions, attributes: ['delivery-paused'] } : {}),
      });
    }
  }
  const consumers = changes.filter((item) => item.address.startsWith('cloudflare_queue_consumer.'));
  if (consumers.length !== 1 || consumers[0].address !== 'cloudflare_queue_consumer.fedify[0]') {
    issues.push({
      message: 'Exactly one Queue consumer is required',
      ...(consumers.length === 1 ? { address: consumers[0].address, actions: consumers[0].change?.actions } : {}),
    });
  }
  return issues;
};
