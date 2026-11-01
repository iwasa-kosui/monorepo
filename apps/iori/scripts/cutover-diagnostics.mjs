import { classifyFailure, isCutoverReason } from './failure-classification.mjs';
import { isSmokeDetail } from './smoke-diagnostics.mjs';
import { isPreparationReason } from './target-preparation-diagnostics.mjs';

export { isCutoverReason };
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
const MAX_DETAIL_LINES = 13;
export const cutoverFailureLines = (stage, error, aborted) => {
  const stageWord = CUTOVER_STAGES.includes(stage) ? stage : 'unclassified';
  const line = (reason) => `IORI_DIAG stage=cutover-${stageWord} program=none exit=none signal=none reason=${reason}`;
  const details = Array.isArray(error?.diagnostic?.details) ? error.diagnostic.details : [];
  return [
    ...[...new Set(details.filter((detail) => isPreparationReason(detail) || isSmokeDetail(detail)))].slice(
      0,
      MAX_DETAIL_LINES,
    ).map(line),
    line(classifyFailure(error, aborted)),
  ];
};
