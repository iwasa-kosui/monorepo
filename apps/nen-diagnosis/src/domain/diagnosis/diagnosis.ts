import { NEN_TYPES, NenType } from '../nenType/nenType.ts';
import type { Answer, Question, TraitAxis } from '../question/question.ts';

export type Score = Record<NenType, number>;

/**
 * 判定根拠 - どの回答がどの系統に加点されたか
 */
export type JudgmentBasis = Readonly<{
  questionId: number;
  questionText: string;
  answerText: string;
  traitAxis: TraitAxis;
  nenType: NenType;
}>;

/**
 * 特性軸ごとの回答数
 */
export type TraitAxisCounts = Record<TraitAxis, number>;

export type DiagnosisResult = Readonly<{
  /** 各念タイプのスコア */
  scores: Score;
  /** 判定された主要タイプ */
  primaryType: NenType;
  /** 副次タイプ（2番目に高いスコア） */
  secondaryType: NenType | null;
  /** 各タイプの構成比率（%） */
  percentages: Record<NenType, number>;
  /** 判定根拠（どの回答がどの系統に加点されたか） */
  judgmentBasis: readonly JudgmentBasis[];
  /** 特性軸ごとの回答数 */
  traitAxisCounts: TraitAxisCounts;
}>;

const createEmptyScore = (): Score => ({
  enhancement: 0,
  transmutation: 0,
  emission: 0,
  manipulation: 0,
  conjuration: 0,
  specialization: 0,
});

const createEmptyTraitAxisCounts = (): TraitAxisCounts => ({
  simplicity: 0,
  whimsicality: 0,
  impulsiveness: 0,
  rationality: 0,
  meticulousness: 0,
  individualism: 0,
});

/**
 * 回答をスコアに加算
 */
const addAnswer = (current: Score, answer: Answer): Score => {
  const newScore = { ...current };
  newScore[answer.nenType] += 1;
  return newScore;
};

/**
 * 各念タイプの構成比率を計算
 */
const calculatePercentages = (scores: Score): Record<NenType, number> => {
  const total = Object.values(scores).reduce((sum, v) => sum + v, 0);
  if (total === 0) {
    return createEmptyScore();
  }

  const percentages: Record<string, number> = {};
  for (const type of NEN_TYPES) {
    percentages[type] = Math.round((scores[type] / total) * 100);
  }
  return percentages as Record<NenType, number>;
};

/**
 * スコアが最も高いタイプを特定
 */
const findTopTypes = (
  scores: Score,
): { primary: NenType; secondary: NenType | null } => {
  const sortedTypes = [...NEN_TYPES].sort((a, b) => scores[b] - scores[a]);
  const primary = sortedTypes[0];
  const secondary = scores[sortedTypes[1]] > 0 ? sortedTypes[1] : null;

  return { primary, secondary };
};

/**
 * 判定根拠を生成
 */
const createJudgmentBasis = (
  questions: readonly Question[],
  answers: readonly Answer[],
): readonly JudgmentBasis[] => {
  return answers
    .map((answer, index) => {
      const question = questions[index];
      if (!question) return null;
      return {
        questionId: question.id,
        questionText: question.text,
        answerText: answer.text,
        traitAxis: answer.traitAxis,
        nenType: answer.nenType,
      };
    })
    .filter((basis): basis is JudgmentBasis => basis !== null);
};

/**
 * 特性軸ごとの回答数を集計
 */
const countTraitAxes = (answers: readonly Answer[]): TraitAxisCounts => {
  const counts = createEmptyTraitAxisCounts();
  for (const answer of answers) {
    counts[answer.traitAxis] += 1;
  }
  return counts;
};

export const Diagnosis = {
  createEmptyScore,

  addAnswer: (currentScore: Score, answer: Answer): Score => {
    return addAnswer(currentScore, answer);
  },

  /**
   * 診断結果を計算
   * 判定根拠を含めた結果を返す
   */
  calculate: (
    scores: Score,
    answers: readonly Answer[],
    questions: readonly Question[],
  ): DiagnosisResult => {
    const { primary, secondary } = findTopTypes(scores);
    const percentages = calculatePercentages(scores);
    const judgmentBasis = createJudgmentBasis(questions, answers);
    const traitAxisCounts = countTraitAxes(answers);

    // スコアベースの判定を採用（より客観的）
    const finalPrimaryType = primary;

    return {
      scores,
      primaryType: finalPrimaryType,
      secondaryType: secondary !== finalPrimaryType ? secondary : null,
      percentages,
      judgmentBasis,
      traitAxisCounts,
    };
  },
} as const;
