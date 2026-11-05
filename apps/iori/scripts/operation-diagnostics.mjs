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
  'rehearsal-delete',
  'rehearsal-delete-list',
  'rehearsal-delete-check',
  'rehearsal-delete-remove',
  'rehearsal-delete-verify',
  'move-reposts',
  'move-reposts-resolve',
  'move-reposts-query',
  'events-stats',
  'events-stats-resolve',
  'events-stats-query',
  'prune-posts',
  'prune-posts-resolve',
  'prune-posts-query',
  'archive-bucket',
  'archive-bucket-resolve',
  'archive-bucket-read',
  'archive-bucket-create',
  'archive-bucket-verify',
]);
export const operationFailureLines = (stage, error) => {
  const stageWord = OPERATION_STAGES.includes(stage) ? stage : 'unclassified';
  const line = (reason) => `IORI_DIAG stage=${stageWord} program=none exit=none signal=none reason=${reason}`;
  const adopted = error?.diagnostic === undefined && Array.isArray(error?.errors) ? error.errors[0] : error;
  const details = Array.isArray(adopted?.diagnostic?.details) ? adopted.diagnostic.details : [];
  return [...[...new Set(details.filter(isPreparationReason))].slice(0, 8).map(line), line(classifyFailure(adopted))];
};
