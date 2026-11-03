import { classifyFailure } from './failure-classification.mjs';
import { isPreparationReason } from './target-preparation-diagnostics.mjs';

export const OPERATION_STAGES = Object.freeze([
  'deploy-worker-before',
  'deploy-worker-resolve',
  'deploy-worker-migrate',
  'deploy-worker-deploy',
  'deploy-worker-after',
  'put-worker-secrets',
  'put-worker-secrets-read',
  'put-worker-secrets-put',
]);
export const operationFailureLines = (stage, error) => {
  const stageWord = OPERATION_STAGES.includes(stage) ? stage : 'unclassified';
  const line = (reason) => `IORI_DIAG stage=${stageWord} program=none exit=none signal=none reason=${reason}`;
  const adopted = error?.diagnostic === undefined && Array.isArray(error?.errors) ? error.errors[0] : error;
  const details = Array.isArray(adopted?.diagnostic?.details) ? adopted.diagnostic.details : [];
  return [...[...new Set(details.filter(isPreparationReason))].slice(0, 8).map(line), line(classifyFailure(adopted))];
};
