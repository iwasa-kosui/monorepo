import { SOURCE_REJECTION_DETAILS, SOURCE_SSH_REASONS } from './source-transfer-protocol.mjs';
import { isPreparationReason } from './target-preparation-diagnostics.mjs';

const CUTOVER_REASONS = new Set([
  ...SOURCE_SSH_REASONS,
  ...SOURCE_REJECTION_DETAILS,
  'reviewed-main-required',
  'reviewed-checkout-mismatch',
  'reviewed-checkout-dirty',
  'reviewed-main-changed',
  'job-budget-exhausted',
  'deploy-failed',
]);
const MESSAGE_REASONS = new Map([
  ['Reviewed main is required.', 'reviewed-main-required'],
  ['Reviewed checkout mismatch.', 'reviewed-checkout-mismatch'],
  ['Tracked checkout is dirty.', 'reviewed-checkout-dirty'],
  ['Reviewed main changed.', 'reviewed-main-changed'],
  ['Hosted job budget is exhausted.', 'job-budget-exhausted'],
  ['Reviewed Worker deployment failed; retain current state.', 'deploy-failed'],
  ['Invalid source inputs.', 'config-invalid'],
  ['Target setup configuration is required.', 'config-invalid'],
  ['Target setup invocation is invalid.', 'config-invalid'],
  ['Protected workflow invocation is invalid.', 'config-invalid'],
  ['Migration target evidence is invalid.', 'identity-mismatch'],
]);
export const isCutoverReason = (reason) =>
  typeof reason === 'string' && (isPreparationReason(reason) || CUTOVER_REASONS.has(reason));
export const classifyFailure = (error, aborted) => {
  if (aborted === true || error?.name === 'AbortError' || error?.name === 'TimeoutError') return 'aborted';
  const reason = error?.diagnostic?.reason;
  if (isCutoverReason(reason)) return reason;
  const message = typeof error?.message === 'string' ? error.message : undefined;
  return (message !== undefined && MESSAGE_REASONS.get(message)) || 'unclassified';
};
