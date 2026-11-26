export type SceneAnswerKey = 'who' | 'when' | 'what' | 'why';

export type SceneAnswer = { readonly key: SceneAnswerKey; readonly label: string };

export type AnswerSource = { readonly column: string; readonly field?: string };

export type SceneStep = {
  readonly snapshot: string;
  readonly answer: string;
  readonly storageId: string;
  readonly carryFrom: string | null;
  readonly table: string;
  readonly label: string;
  readonly answers: readonly SceneAnswer[];
  readonly sources: Readonly<Record<SceneAnswerKey, AnswerSource | null>>;
};

const who: SceneAnswer = { key: 'who', label: '誰が' };
const when: SceneAnswer = { key: 'when', label: 'いつ' };
const what: SceneAnswer = { key: 'what', label: '何を' };
const why: SceneAnswer = { key: 'why', label: 'なぜ' };

export const sceneSteps: Readonly<Record<1 | 2, SceneStep>> = {
  1: {
    snapshot: 'chapter-1-start',
    answer: 'chapter-2-step-1',
    storageId: 'step-1',
    carryFrom: null,
    table: 'visit_cancellations',
    label: 'ステップ1: キャンセルの記録を1行足す',
    answers: [who, when, why],
    sources: {
      who: { column: 'operated_by' },
      when: { column: 'cancelled_at' },
      what: null,
      why: { column: 'reason' },
    },
  },
  2: {
    snapshot: 'chapter-2-step-2-start',
    answer: 'chapter-2-step-2',
    storageId: 'step-2',
    carryFrom: 'step-1',
    table: 'business_events',
    label: 'ステップ2: 記録を business_events に移す',
    answers: [who, when, what, why],
    sources: {
      who: { column: 'payload', field: 'operatedBy' },
      when: { column: 'event_at' },
      what: { column: 'event_name' },
      why: { column: 'payload', field: 'reason' },
    },
  },
};

export const answersOfColumn = (scene: SceneStep, column: string): SceneAnswer[] =>
  scene.answers.filter((answer) => scene.sources[answer.key]?.column === column);
