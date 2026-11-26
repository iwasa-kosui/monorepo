import type { AgentStep } from './agent-protocol.ts';
import { sceneSteps } from './scene-steps.ts';

export const editedFile = 'visits.ts';
export const exercisesName = 'es-patchwork-exercises';
export const exercisesArchive = `${exercisesName}.tar.gz`;
export const testCommand = 'node --test visits.test.ts';
export const nodeRequirement = '24.12.0';
export const completion = 'pass 8 / fail 0';

const sentences: Readonly<Record<AgentStep, readonly string[]>> = {
  1: [
    '問い合わせの「誰が」「いつ」「なぜ」に答えるには、`visit_cancellations` に1行を入れます。',
    '呼び出し元は、理由と操作した人を `cancelVisit` に渡しています。いまの `cancelVisit` は、その2つを受け取っていません。',
    '記録は、来院の更新と同じトランザクションの中に置きます。',
  ],
  2: [
    '書き込み先を `visit_cancellations` から `business_events` に変えます。',
    'ステップ2の DB に `visit_cancellations` テーブルはありません。',
  ],
};

const localSentences: Readonly<Record<AgentStep, readonly string[]>> = {
  1: [],
  2: [
    'このディレクトリの `db.ts` とテストは、`business_events` 用です。`visits.ts` はステップ1の解答です。',
  ],
};

export const directoryOf = (step: AgentStep): string => sceneSteps[step].snapshot;

export const titleOf = (step: AgentStep): string => sceneSteps[step].label;

export const taskSentencesOf = (step: AgentStep): readonly string[] => sentences[step];

export const localTaskSentencesOf = (step: AgentStep): readonly string[] => [
  ...localSentences[step],
  ...sentences[step],
];
