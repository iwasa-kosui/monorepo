import { NEN_TYPES, NenType } from '../nenType/nenType.ts';
import type { Answer } from '../question/question.ts';

export type Score = Record<NenType, number>;

export type DiagnosisResult = Readonly<{
  scores: Score;
  primaryType: NenType;
  secondaryType: NenType | null;
  percentages: Record<NenType, number>;
}>;

const createEmptyScore = (): Score => ({
  enhancement: 0,
  transmutation: 0,
  emission: 0,
  manipulation: 0,
  conjuration: 0,
  specialization: 0,
});

const addScores = (current: Score, answer: Answer): Score => {
  const newScore = { ...current };
  for (const [type, value] of Object.entries(answer.scores)) {
    newScore[type as NenType] += value ?? 0;
  }
  return newScore;
};

const calculatePercentages = (scores: Score): Record<NenType, number> => {
  const total = Object.values(scores).reduce((sum, v) => sum + v, 0);
  if (total === 0) {
    return {
      enhancement: 0,
      transmutation: 0,
      emission: 0,
      manipulation: 0,
      conjuration: 0,
      specialization: 0,
    };
  }

  const percentages: Record<string, number> = {};
  for (const type of NEN_TYPES) {
    percentages[type] = Math.round((scores[type] / total) * 100);
  }
  return percentages as Record<NenType, number>;
};

const findTopTypes = (scores: Score): { primary: NenType; secondary: NenType | null } => {
  const sortedTypes = [...NEN_TYPES].sort((a, b) => scores[b] - scores[a]);
  const primary = sortedTypes[0];
  const secondary = scores[sortedTypes[1]] > 0 ? sortedTypes[1] : null;

  return { primary, secondary };
};

const checkForSpecialization = (scores: Score, answers: readonly Answer[]): boolean => {
  const specializationAnswerCount = answers.filter(a =>
    a.scores.specialization && a.scores.specialization > 0
  ).length;

  const sortedScores = Object.values(scores).sort((a, b) => b - a);
  const topScore = sortedScores[0];
  const secondScore = sortedScores[1];

  const isBalanced = topScore > 0 && secondScore > 0 && (topScore - secondScore) <= 2;

  return specializationAnswerCount >= 2 || isBalanced;
};

export const Diagnosis = {
  createEmptyScore,

  addAnswer: (currentScore: Score, answer: Answer): Score => {
    return addScores(currentScore, answer);
  },

  calculate: (scores: Score, answers: readonly Answer[]): DiagnosisResult => {
    const { primary, secondary } = findTopTypes(scores);
    const percentages = calculatePercentages(scores);

    const shouldBeSpecialization = checkForSpecialization(scores, answers);
    const finalPrimaryType = shouldBeSpecialization && primary !== 'specialization'
      ? (scores.specialization >= scores[primary] ? 'specialization' : primary)
      : primary;

    return {
      scores,
      primaryType: finalPrimaryType,
      secondaryType: secondary !== finalPrimaryType ? secondary : null,
      percentages,
    };
  },
} as const;
