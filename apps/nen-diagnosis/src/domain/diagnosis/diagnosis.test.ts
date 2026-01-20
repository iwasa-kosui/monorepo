import { describe, expect, it } from 'vitest';

import { JUDGMENT_AXES } from '../judgmentAxis/judgmentAxis.ts';
import { NEN_TYPES } from '../nenType/nenType.ts';
import type { Answer, Question } from '../question/question.ts';
import { type AxisScore, Diagnosis } from './diagnosis.ts';

describe('Diagnosis', () => {
  describe('createEmptyScore', () => {
    it('全ての念タイプが0で初期化される', () => {
      const score = Diagnosis.createEmptyScore();
      for (const type of NEN_TYPES) {
        expect(score[type]).toBe(0);
      }
    });
  });

  describe('createEmptyAxisScore', () => {
    it('全ての判断軸が0で初期化される', () => {
      const axisScore = Diagnosis.createEmptyAxisScore();
      for (const axis of JUDGMENT_AXES) {
        expect(axisScore[axis]).toBe(0);
      }
    });
  });

  describe('addAnswerToAxisScore', () => {
    it('positive方向の回答で軸スコアが+1される', () => {
      const initial = Diagnosis.createEmptyAxisScore();
      const answer: Answer = {
        id: '1a',
        text: 'テスト回答',
        axis: 'commitment',
        direction: 'positive',
      };
      const result = Diagnosis.addAnswerToAxisScore(initial, answer);
      expect(result.commitment).toBe(1);
    });

    it('negative方向の回答で軸スコアが-1される', () => {
      const initial = Diagnosis.createEmptyAxisScore();
      const answer: Answer = {
        id: '1b',
        text: 'テスト回答',
        axis: 'commitment',
        direction: 'negative',
      };
      const result = Diagnosis.addAnswerToAxisScore(initial, answer);
      expect(result.commitment).toBe(-1);
    });

    it('同じ軸に複数回回答すると累積される', () => {
      let axisScore = Diagnosis.createEmptyAxisScore();
      const positiveAnswer: Answer = {
        id: '1a',
        text: 'positive',
        axis: 'commitment',
        direction: 'positive',
      };
      const negativeAnswer: Answer = {
        id: '2b',
        text: 'negative',
        axis: 'commitment',
        direction: 'negative',
      };

      axisScore = Diagnosis.addAnswerToAxisScore(axisScore, positiveAnswer);
      axisScore = Diagnosis.addAnswerToAxisScore(axisScore, positiveAnswer);
      expect(axisScore.commitment).toBe(2);

      axisScore = Diagnosis.addAnswerToAxisScore(axisScore, negativeAnswer);
      expect(axisScore.commitment).toBe(1);
    });

    it('異なる軸への回答は他の軸に影響しない', () => {
      const initial = Diagnosis.createEmptyAxisScore();
      const answer: Answer = {
        id: '1a',
        text: 'テスト回答',
        axis: 'commitment',
        direction: 'positive',
      };
      const result = Diagnosis.addAnswerToAxisScore(initial, answer);
      expect(result.commitment).toBe(1);
      expect(result.logic).toBe(0);
      expect(result.independence).toBe(0);
    });
  });

  describe('calculate', () => {
    const createMockQuestion = (id: number, axis: string): Question => ({
      id,
      axis: axis as Answer['axis'],
      text: `質問${id}`,
      answers: [
        {
          id: `${id}a`,
          text: 'positive回答',
          axis: axis as Answer['axis'],
          direction: 'positive',
        },
        {
          id: `${id}b`,
          text: 'negative回答',
          axis: axis as Answer['axis'],
          direction: 'negative',
        },
      ],
    });

    it('診断結果に必要なフィールドが全て含まれる', () => {
      const axisScores: AxisScore = Diagnosis.createEmptyAxisScore();
      const answers: Answer[] = [];
      const questions: Question[] = [];

      const result = Diagnosis.calculate(axisScores, answers, questions);

      expect(result).toHaveProperty('axisScores');
      expect(result).toHaveProperty('nenTypeScores');
      expect(result).toHaveProperty('primaryType');
      expect(result).toHaveProperty('secondaryType');
      expect(result).toHaveProperty('percentages');
      expect(result).toHaveProperty('judgmentBasis');
    });

    it('commitment軸がpositiveのとき強化系のスコアが上がる', () => {
      const axisScores: AxisScore = {
        ...Diagnosis.createEmptyAxisScore(),
        commitment: 2,
      };

      const result = Diagnosis.calculate(axisScores, [], []);

      expect(result.nenTypeScores.enhancement).toBeGreaterThan(0);
      expect(result.primaryType).toBe('enhancement');
    });

    it('commitment軸がnegativeのとき変化系のスコアが上がる', () => {
      const axisScores: AxisScore = {
        ...Diagnosis.createEmptyAxisScore(),
        commitment: -2,
      };

      const result = Diagnosis.calculate(axisScores, [], []);

      expect(result.nenTypeScores.transmutation).toBeGreaterThan(0);
    });

    it('logic軸がpositiveのとき操作系のスコアが上がる', () => {
      const axisScores: AxisScore = {
        ...Diagnosis.createEmptyAxisScore(),
        logic: 2,
      };

      const result = Diagnosis.calculate(axisScores, [], []);

      expect(result.nenTypeScores.manipulation).toBeGreaterThan(0);
    });

    it('caution軸がnegativeのとき放出系のスコアが上がる', () => {
      const axisScores: AxisScore = {
        ...Diagnosis.createEmptyAxisScore(),
        caution: -2,
      };

      const result = Diagnosis.calculate(axisScores, [], []);

      expect(result.nenTypeScores.emission).toBeGreaterThan(0);
    });

    it('independence軸とcharisma軸がpositiveのとき特質系のスコアが上がる', () => {
      const axisScores: AxisScore = {
        ...Diagnosis.createEmptyAxisScore(),
        independence: 2,
        charisma: 2,
      };

      const result = Diagnosis.calculate(axisScores, [], []);

      expect(result.nenTypeScores.specialization).toBeGreaterThan(0);
      expect(result.primaryType).toBe('specialization');
    });

    it('caution軸がpositiveのとき具現化系のスコアが上がる', () => {
      const axisScores: AxisScore = {
        ...Diagnosis.createEmptyAxisScore(),
        caution: 2,
      };

      const result = Diagnosis.calculate(axisScores, [], []);

      expect(result.nenTypeScores.conjuration).toBeGreaterThan(0);
    });

    it('全ての軸が0のときスコアも0になる', () => {
      const axisScores = Diagnosis.createEmptyAxisScore();

      const result = Diagnosis.calculate(axisScores, [], []);

      for (const type of NEN_TYPES) {
        expect(result.nenTypeScores[type]).toBe(0);
      }
    });

    it('パーセンテージの合計が100になる（スコアがある場合）', () => {
      const axisScores: AxisScore = {
        ...Diagnosis.createEmptyAxisScore(),
        commitment: 1,
        logic: 1,
        independence: 1,
      };

      const result = Diagnosis.calculate(axisScores, [], []);

      const totalPercentage = Object.values(result.percentages).reduce((sum, v) => sum + v, 0);
      // 四捨五入により±1の誤差を許容
      expect(totalPercentage).toBeGreaterThanOrEqual(99);
      expect(totalPercentage).toBeLessThanOrEqual(101);
    });

    it('全てのスコアが0のときパーセンテージも0になる', () => {
      const axisScores = Diagnosis.createEmptyAxisScore();

      const result = Diagnosis.calculate(axisScores, [], []);

      for (const type of NEN_TYPES) {
        expect(result.percentages[type]).toBe(0);
      }
    });

    it('判定根拠が正しく生成される', () => {
      const question = createMockQuestion(1, 'commitment');
      const answer = question.answers[0]; // positive

      const axisScores = Diagnosis.createEmptyAxisScore();
      const result = Diagnosis.calculate(axisScores, [answer], [question]);

      expect(result.judgmentBasis).toHaveLength(1);
      expect(result.judgmentBasis[0]).toEqual({
        questionId: 1,
        questionText: '質問1',
        answerText: 'positive回答',
        axis: 'commitment',
        direction: 'positive',
      });
    });

    it('secondaryTypeがprimaryTypeと同じにならない', () => {
      const axisScores: AxisScore = {
        ...Diagnosis.createEmptyAxisScore(),
        commitment: 2,
      };

      const result = Diagnosis.calculate(axisScores, [], []);

      if (result.secondaryType !== null) {
        expect(result.secondaryType).not.toBe(result.primaryType);
      }
    });

    it('2番目のスコアが0の場合secondaryTypeはnull', () => {
      // 強化系のみにスコアが入るようにする
      const axisScores: AxisScore = {
        ...Diagnosis.createEmptyAxisScore(),
        commitment: 2,
        honesty: 2,
        empathy: 2,
      };

      const result = Diagnosis.calculate(axisScores, [], []);

      // スコアの内訳を確認
      const sortedScores = NEN_TYPES.map((t) => ({
        type: t,
        score: result.nenTypeScores[t],
      })).sort((a, b) => b.score - a.score);

      // 2番目のスコアが0ならsecondaryTypeはnull
      if (sortedScores[1].score === 0) {
        expect(result.secondaryType).toBeNull();
      }
    });
  });
});
