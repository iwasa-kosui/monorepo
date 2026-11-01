import { SOURCE_REJECTION_DETAILS, SOURCE_SSH_REASONS } from './source-transfer-protocol.mjs';
import { isPreparationReason } from './target-preparation-diagnostics.mjs';

export const CUTOVER_STAGES = Object.freeze([
  'inputs',
  'main-check',
  'restore',
  'tf-init',
  'target-check',
  'source',
  'gate-smoke',
  'to-smoke',
  'smoke-worker',
  'gate-route',
  'read-smoke',
  'route-plan',
  'route-apply',
  'read-route',
  'smoke-canonical',
  'gate-active',
  'to-active',
  'gate-queue',
  'read-active',
  'queue-plan',
  'queue-apply',
  'read-resume',
  'smoke-final',
]);
export const PROBE_STAGES = Object.freeze([
  'inputs',
  'rehearsal-gate',
  'tf-init',
  'read-sealed',
  'route-plan',
  'queue-plan',
  'to-smoke',
  'smoke-worker',
  'to-sealed',
  'read-final',
]);
const CUTOVER_REASONS = new Set([
  ...SOURCE_SSH_REASONS,
  ...SOURCE_REJECTION_DETAILS,
  'reviewed-main-required',
  'reviewed-checkout-mismatch',
  'reviewed-checkout-dirty',
  'reviewed-main-changed',
  'job-budget-exhausted',
  'smoke-failed',
  'verify-failed',
  'deploy-failed',
  'source-not-quiescent',
  'rehearsal-missing',
]);
const MESSAGE_REASONS = new Map([
  ['Reviewed main is required.', 'reviewed-main-required'],
  ['Reviewed checkout mismatch.', 'reviewed-checkout-mismatch'],
  ['Tracked checkout is dirty.', 'reviewed-checkout-dirty'],
  ['Reviewed main changed.', 'reviewed-main-changed'],
  ['Hosted job budget is exhausted.', 'job-budget-exhausted'],
  ['Reviewed smoke failed.', 'smoke-failed'],
  ['Fresh verification failed.', 'verify-failed'],
  ['Reviewed Worker deployment failed; retain current state.', 'deploy-failed'],
  ['Invalid source inputs.', 'config-invalid'],
  ['Fresh verification configuration is required.', 'config-invalid'],
  ['Target setup configuration is required.', 'config-invalid'],
  ['Target setup invocation is invalid.', 'config-invalid'],
]);
export const isCutoverReason = (reason) =>
  typeof reason === 'string' && (isPreparationReason(reason) || CUTOVER_REASONS.has(reason));
const classify = (error, aborted) => {
  if (aborted === true || error?.name === 'AbortError' || error?.name === 'TimeoutError') return 'aborted';
  const reason = error?.diagnostic?.reason;
  if (isCutoverReason(reason)) return reason;
  const message = typeof error?.message === 'string' ? error.message : undefined;
  return (message !== undefined && MESSAGE_REASONS.get(message)) || 'unclassified';
};
const failureLines = (prefix, stages) => (stage, error, aborted) => {
  const stageWord = stages.includes(stage) ? stage : 'unclassified';
  const line = (reason) => `IORI_DIAG stage=${prefix}-${stageWord} program=none exit=none signal=none reason=${reason}`;
  const details = Array.isArray(error?.diagnostic?.details) ? error.diagnostic.details : [];
  return [
    ...[...new Set(details.filter(isPreparationReason))].slice(0, 8).map(line),
    line(classify(error, aborted)),
  ];
};
export const cutoverFailureLines = failureLines('cutover', CUTOVER_STAGES);
export const probeFailureLines = failureLines('probe', PROBE_STAGES);
