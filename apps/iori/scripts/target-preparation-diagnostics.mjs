export const PREPARATION_STAGES = Object.freeze([
  'inputs',
  'vapid',
  'setup',
  'fresh-check',
  'tf-init',
  'tf-show',
  'tf-plan',
  'tf-apply',
  'resource-read',
  'deploy',
  'deploy-read',
  'attach',
  'attach-tf-plan',
  'attach-tf-apply',
  'attach-read',
  'readback',
  'record',
]);
export const CONTROL_PLANE_APIS = Object.freeze(['workers', 'd1', 'kv', 'queues', 'r2', 'zones', 'other']);
const FIXED_REASONS = new Set([
  'state-mismatch',
  'resource-input',
  'resource-d1',
  'resource-kv',
  'resource-r2',
  'resource-queue-identity',
  'resource-queue-paused',
  'resource-queue-shape',
  'resource-queue-created',
  'resource-dlq-attached',
  'resource-consumer-count',
  'resource-producer',
  'resource-consumer-type',
  'resource-consumer-script',
  'resource-consumer-dlq',
  'resource-consumer-id',
  'resource-consumer-settings',
  'resource-domain-public',
  'queue-not-paused',
  'not-sealed',
  'worker-input',
  'worker-resources',
  'worker-deployment',
  'worker-version',
  'worker-subdomain',
  'worker-route',
  'worker-bindings-shape',
  'worker-binding-missing',
  'worker-binding-mismatch',
  'worker-binding-extra',
  'worker-secret-missing',
  'command-failed',
  'aborted',
  'state-present',
  'plan-rejected',
  'plan-invalid',
  'plan-bindings-changed',
  'output-mismatch',
  'output-invalid',
  'result-invalid',
  'identity-mismatch',
  'mismatch',
  'config-invalid',
  'credentials-missing',
  'credential-not-distinct',
  'vapid-rejected',
  'unclassified',
]);
const controlPlaneReason = new RegExp(
  `^(?:${CONTROL_PLANE_APIS.join('|')})-(?:http-[1-5][0-9]{2}|request|too-large|shape|limit|exists)$`,
);
export const controlPlaneApi = (path) => {
  const [, scope, , area, section] = String(path).split('?')[0].split('/');
  if (scope === 'zones') return 'zones';
  if (scope !== 'accounts') return 'other';
  if (area === 'workers' || area === 'd1' || area === 'queues' || area === 'r2') return area;
  if (area === 'storage' && section === 'kv') return 'kv';
  return 'other';
};
const PLAN_RESOURCES = Object.freeze({
  'cloudflare_d1_database.iori': 'd1',
  'cloudflare_r2_bucket.uploads': 'uploads',
  'cloudflare_workers_kv_namespace.fedify': 'kv',
  'cloudflare_queue.fedify': 'queue',
  'cloudflare_queue.fedify_dlq': 'dlq',
  'cloudflare_r2_bucket.migration': 'transfer',
  'cloudflare_r2_managed_domain.migration': 'transfer-domain',
  'cloudflare_queue_consumer.fedify': 'consumer',
  'cloudflare_queue_consumer.fedify[0]': 'consumer',
  'cloudflare_workers_route.iori': 'route',
  'cloudflare_workers_route.iori[0]': 'route',
});
const PLAN_RESOURCE_WORDS = [
  'd1',
  'uploads',
  'kv',
  'queue',
  'dlq',
  'transfer',
  'transfer-domain',
  'consumer',
  'route',
  'other',
];
const PLAN_ACTION_WORDS = ['create', 'update', 'delete', 'no-op', 'replace', 'other'];
const planReason = new RegExp(`^plan-(?:${PLAN_RESOURCE_WORDS.join('|')})-(?:${PLAN_ACTION_WORDS.join('|')})$`);
const planResourceWord = (address) =>
  typeof address === 'string' && Object.hasOwn(PLAN_RESOURCES, address) ? PLAN_RESOURCES[address] : 'other';
const planActionWord = (actions) => {
  if (!Array.isArray(actions)) return 'other';
  if (actions.length === 1 && ['create', 'update', 'delete', 'no-op'].includes(actions[0])) return actions[0];
  if (actions.length === 2 && actions.includes('delete') && actions.includes('create')) return 'replace';
  return 'other';
};
export const planRejectionDetails = (issues) => [
  ...new Set(
    issues.map((issue) =>
      issue.address === undefined
        ? 'plan-invalid'
        : `plan-${planResourceWord(issue.address)}-${planActionWord(issue.actions)}`
    ),
  ),
];
export const isPreparationReason = (reason) =>
  typeof reason === 'string'
  && (FIXED_REASONS.has(reason) || controlPlaneReason.test(reason) || planReason.test(reason));
export const withReason = (error, reason) => {
  const target = error instanceof Error ? error : new Error('Target preparation failed.');
  if (target.diagnostic !== undefined) return target;
  return Object.assign(target, { diagnostic: { reason } });
};
export const preparationFailureLine = (stage, error, aborted) => {
  const stageWord = PREPARATION_STAGES.includes(stage) ? stage : 'unclassified';
  const diagnostic = error?.diagnostic;
  let reason = 'unclassified';
  if (diagnostic?.reason !== undefined) {
    if (isPreparationReason(diagnostic.reason)) reason = diagnostic.reason;
  } else if (aborted === true || error?.name === 'AbortError' || error?.name === 'TimeoutError') {
    reason = 'aborted';
  }
  return `IORI_DIAG stage=prepare-${stageWord} program=none exit=none signal=none reason=${reason}`;
};
export const preparationDetailLines = (stage, error) => {
  const stageWord = PREPARATION_STAGES.includes(stage) ? stage : 'unclassified';
  const details = Array.isArray(error?.diagnostic?.details) ? error.diagnostic.details : [];
  return [...new Set(details.filter(isPreparationReason))].slice(0, 8).map((detail) =>
    `IORI_DIAG stage=prepare-${stageWord} program=none exit=none signal=none reason=${detail}`
  );
};
export const OPERATION_STAGES = Object.freeze([
  'verify-import',
  'rehearse-migration',
  'migrate-data',
  'deploy-worker-before',
  'deploy-worker-after',
]);
export const operationFailureLines = (stage, error) => {
  const stageWord = OPERATION_STAGES.includes(stage) ? stage : 'unclassified';
  const line = (reason) => `IORI_DIAG stage=${stageWord} program=none exit=none signal=none reason=${reason}`;
  const adopted = error?.diagnostic === undefined && Array.isArray(error?.errors) ? error.errors[0] : error;
  const details = Array.isArray(adopted?.diagnostic?.details) ? adopted.diagnostic.details : [];
  let reason = 'unclassified';
  if (isPreparationReason(adopted?.diagnostic?.reason)) reason = adopted.diagnostic.reason;
  else if (adopted?.name === 'AbortError' || adopted?.name === 'TimeoutError') reason = 'aborted';
  return [...[...new Set(details.filter(isPreparationReason))].slice(0, 8).map(line), line(reason)];
};
