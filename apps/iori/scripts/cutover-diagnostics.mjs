import { classifyFailure, isCutoverReason } from './failure-classification.mjs';
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
export class ProbeRestoreFailure extends Error {
  constructor(failure, failedStage, restoreFailure) {
    super('Probe restore failed.');
    this.failure = failure;
    this.failedStage = failedStage;
    this.restoreFailure = restoreFailure;
  }
}
const failureLines = (prefix, stages) => (stage, error, aborted) => {
  if (prefix === 'probe' && error instanceof ProbeRestoreFailure) {
    return [
      ...failureLines(prefix, stages)(error.failedStage, error.failure, aborted),
      ...failureLines(prefix, stages)('to-sealed', error.restoreFailure, false),
    ];
  }
  const stageWord = stages.includes(stage) ? stage : 'unclassified';
  const line = (reason) => `IORI_DIAG stage=${prefix}-${stageWord} program=none exit=none signal=none reason=${reason}`;
  const details = Array.isArray(error?.diagnostic?.details) ? error.diagnostic.details : [];
  return [
    ...[...new Set(details.filter(isPreparationReason))].slice(0, 8).map(line),
    line(classifyFailure(error, aborted)),
  ];
};
export const cutoverFailureLines = failureLines('cutover', CUTOVER_STAGES);
export const probeFailureLines = failureLines('probe', PROBE_STAGES);
