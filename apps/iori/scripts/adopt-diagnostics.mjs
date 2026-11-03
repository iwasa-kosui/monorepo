import { isAdoptPlanDetail } from './adopt-plan.mjs';
import { classifyFailure } from './failure-classification.mjs';
import { isPreparationReason } from './target-preparation-diagnostics.mjs';

export const ADOPT_STAGES = Object.freeze([
  'adopt-inputs',
  'adopt-main-check',
  'adopt-tf-init',
  'adopt-state-read',
  'adopt-cloud-read',
  'adopt-route-import',
  'adopt-refresh-plan',
  'adopt-refresh-apply',
  'adopt-final-plan',
  'adopt-final-check',
  'adopt-cloud-reread',
]);
export const ADOPT_RESULT_WORDS = Object.freeze({
  'adopt-route-import': Object.freeze(['route-imported', 'route-in-state']),
  'adopt-refresh-plan': Object.freeze(['refresh-no-drift', 'refresh-drift-allowed']),
  'adopt-refresh-apply': Object.freeze(['refresh-applied']),
  'adopt-final-plan': Object.freeze(['plan-clean']),
  'adopt-cloud-reread': Object.freeze(['adopted']),
});
const MAX_DETAIL_LINES = 24;
const line = (stage, reason) => `IORI_DIAG stage=${stage} program=none exit=none signal=none reason=${reason}`;
export const adoptFailureLines = (stage, error, aborted) => {
  const stageWord = ADOPT_STAGES.includes(stage) ? stage : 'unclassified';
  const details = Array.isArray(error?.diagnostic?.details) ? error.diagnostic.details : [];
  return [
    ...[...new Set(details.filter((detail) => isPreparationReason(detail) || isAdoptPlanDetail(detail)))].slice(
      0,
      MAX_DETAIL_LINES,
    ).map((detail) => line(stageWord, detail)),
    line(stageWord, classifyFailure(error, aborted)),
  ];
};
export const adoptResultLine = (stage, word) =>
  line(
    ADOPT_STAGES.includes(stage) ? stage : 'unclassified',
    Object.hasOwn(ADOPT_RESULT_WORDS, stage) && ADOPT_RESULT_WORDS[stage].includes(word) ? word : 'unclassified',
  );
