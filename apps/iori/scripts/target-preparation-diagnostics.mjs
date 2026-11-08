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
  'resource-missing',
  'resource-ambiguous',
  'api-forbidden',
  'api-failed',
  'rehearsal-d1-not-empty',
  'rehearsal-d1-remaining',
  'resolve-d1',
  'resolve-kv',
  'resolve-queue',
  'resolve-dlq',
  'resolve-consumer',
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
  'd1-baseline-mismatch',
  'aborted',
  'result-invalid',
  'cursor-invalid',
  'identity-mismatch',
  'mismatch',
  'config-invalid',
  'credentials-missing',
  'smoke-token-empty',
  'smoke-token-space',
  'smoke-token-charset',
  'smoke-token-short',
  'smoke-token-long',
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
export const isPreparationReason = (reason) =>
  typeof reason === 'string'
  && (FIXED_REASONS.has(reason) || controlPlaneReason.test(reason));
export const withReason = (error, reason) => {
  const target = error instanceof Error ? error : new Error('Target preparation failed.');
  if (target.diagnostic !== undefined) return target;
  return Object.assign(target, { diagnostic: { reason } });
};
