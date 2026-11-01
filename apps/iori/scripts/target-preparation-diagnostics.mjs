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
export const isPreparationReason = (reason) =>
  typeof reason === 'string' && (FIXED_REASONS.has(reason) || controlPlaneReason.test(reason));
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
