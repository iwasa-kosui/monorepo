import { AXIS_CONTRIBUTIONS, JUDGMENT_AXES, type JudgmentAxis } from '../judgmentAxis/judgmentAxis.ts';
import { NEN_TYPES, NenType } from '../nenType/nenType.ts';
import type { Answer, Question } from '../question/question.ts';

export type Score = Record<NenType, number>;

export type AxisScore = Record<JudgmentAxis, number>;

/**
 * 判定根拠 - どの回答がどの軸に寄与したか
 */
export type JudgmentBasis = Readonly<{
  questionId: number;
  questionText: string;
  answerText: string;
  axis: JudgmentAxis;
  direction: 'positive' | 'negative';
}>;

export type DiagnosisResult = Readonly<{
  /** 各判断軸のスコア（-2〜+2） */
  axisScores: AxisScore;
  /** 各念タイプのスコア */
  nenTypeScores: Score;
  /** 判定された主要タイプ */
  primaryType: NenType;
  /** 副次タイプ（2番目に高いスコア） */
  secondaryType: NenType | null;
  /** 各タイプの構成比率（%） */
  percentages: Record<NenType, number>;
  /** 判定根拠（どの回答がどの軸に寄与したか） */
  judgmentBasis: readonly JudgmentBasis[];
}>;

const createEmptyScore = (): Score => ({
  enhancement: 0,
  transmutation: 0,
  emission: 0,
  manipulation: 0,
  conjuration: 0,
  specialization: 0,
});

const createEmptyAxisScore = (): AxisScore => ({
  commitment: 0,
  logic: 0,
  independence: 0,
  caution: 0,
  honesty: 0,
  empathy: 0,
  charisma: 0,
});

/**
 * 回答を軸スコアに反映
 */
const addAnswerToAxisScore = (current: AxisScore, answer: Answer): AxisScore => {
  const newScore = { ...current };
  if (answer.direction === 'positive') {
    newScore[answer.axis] += 1;
  } else {
    newScore[answer.axis] -= 1;
  }
  return newScore;
};

/**
 * 軸スコアから念系統スコアを計算
 */
const calculateNenTypeScores = (axisScores: AxisScore): Score => {
  const scores = createEmptyScore();

  for (const axis of JUDGMENT_AXES) {
    const score = axisScores[axis];
    const contribution = AXIS_CONTRIBUTIONS[axis];

    if (score > 0) {
      // +側の念系統に加点
      for (const { nenType, weight } of contribution.positive) {
        scores[nenType] += score * weight;
      }
    } else if (score < 0) {
      // -側の念系統に加点
      for (const { nenType, weight } of contribution.negative) {
        scores[nenType] += Math.abs(score) * weight;
      }
    }
  }

  return scores;
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
        axis: answer.axis,
        direction: answer.direction,
      };
    })
    .filter((basis): basis is JudgmentBasis => basis !== null);
};

export const Diagnosis = {
  createEmptyScore,
  createEmptyAxisScore,

  addAnswerToAxisScore: (currentAxisScore: AxisScore, answer: Answer): AxisScore => {
    return addAnswerToAxisScore(currentAxisScore, answer);
  },

  /**
   * 診断結果を計算
   */
  calculate: (
    axisScores: AxisScore,
    answers: readonly Answer[],
    questions: readonly Question[],
  ): DiagnosisResult => {
    const nenTypeScores = calculateNenTypeScores(axisScores);
    const { primary, secondary } = findTopTypes(nenTypeScores);
    const percentages = calculatePercentages(nenTypeScores);
    const judgmentBasis = createJudgmentBasis(questions, answers);

    return {
      axisScores,
      nenTypeScores,
      primaryType: primary,
      secondaryType: secondary !== primary ? secondary : null,
      percentages,
      judgmentBasis,
    };
  },
} as const;
