import { describe, expect, it } from 'vitest';

import { NEN_TYPES } from '../nenType/nenType.ts';
import {
  AXIS_CONTRIBUTIONS,
  AXIS_INFO,
  type AxisContribution,
  type AxisInfo,
  JUDGMENT_AXES,
  JudgmentAxis,
} from './judgmentAxis.ts';

describe('JudgmentAxis', () => {
  describe('JUDGMENT_AXES', () => {
    it('7つの判断軸が定義されている', () => {
      expect(JUDGMENT_AXES).toHaveLength(7);
    });

    it('必要な軸が全て含まれている', () => {
      const expectedAxes = [
        'commitment',
        'logic',
        'independence',
        'caution',
        'honesty',
        'empathy',
        'charisma',
      ];
      expect([...JUDGMENT_AXES]).toEqual(expectedAxes);
    });
  });

  describe('AXIS_INFO', () => {
    it('全ての軸に対してAxisInfoが定義されている', () => {
      for (const axis of JUDGMENT_AXES) {
        expect(AXIS_INFO[axis]).toBeDefined();
      }
    });

    it('AxisInfoに必要なプロパティが全て含まれている', () => {
      for (const axis of JUDGMENT_AXES) {
        const info: AxisInfo = AXIS_INFO[axis];
        expect(info.id).toBe(axis);
        expect(typeof info.japaneseName).toBe('string');
        expect(info.japaneseName.length).toBeGreaterThan(0);
        expect(typeof info.positiveLabel).toBe('string');
        expect(info.positiveLabel.length).toBeGreaterThan(0);
        expect(typeof info.negativeLabel).toBe('string');
        expect(info.negativeLabel.length).toBeGreaterThan(0);
        expect(typeof info.description).toBe('string');
        expect(info.description.length).toBeGreaterThan(0);
      }
    });

    it('各軸の日本語名が適切に設定されている', () => {
      expect(AXIS_INFO.commitment.japaneseName).toBe('一途さ');
      expect(AXIS_INFO.logic.japaneseName).toBe('論理性');
      expect(AXIS_INFO.independence.japaneseName).toBe('独立性');
      expect(AXIS_INFO.caution.japaneseName).toBe('几帳面さ');
      expect(AXIS_INFO.honesty.japaneseName).toBe('率直さ');
      expect(AXIS_INFO.empathy.japaneseName).toBe('情の深さ');
      expect(AXIS_INFO.charisma.japaneseName).toBe('カリスマ性');
    });
  });

  describe('AXIS_CONTRIBUTIONS', () => {
    it('全ての軸に対してContributionが定義されている', () => {
      for (const axis of JUDGMENT_AXES) {
        expect(AXIS_CONTRIBUTIONS[axis]).toBeDefined();
      }
    });

    it('各Contributionにpositiveとnegativeが定義されている', () => {
      for (const axis of JUDGMENT_AXES) {
        const contribution: AxisContribution = AXIS_CONTRIBUTIONS[axis];
        expect(contribution.positive).toBeDefined();
        expect(Array.isArray(contribution.positive)).toBe(true);
        expect(contribution.negative).toBeDefined();
        expect(Array.isArray(contribution.negative)).toBe(true);
      }
    });

    it('全てのContributionの重みが正の値である', () => {
      for (const axis of JUDGMENT_AXES) {
        const contribution = AXIS_CONTRIBUTIONS[axis];
        for (const c of contribution.positive) {
          expect(c.weight).toBeGreaterThan(0);
        }
        for (const c of contribution.negative) {
          expect(c.weight).toBeGreaterThan(0);
        }
      }
    });

    it('Contributionで参照されるnenTypeが有効な念タイプである', () => {
      for (const axis of JUDGMENT_AXES) {
        const contribution = AXIS_CONTRIBUTIONS[axis];
        for (const c of contribution.positive) {
          expect(NEN_TYPES).toContain(c.nenType);
        }
        for (const c of contribution.negative) {
          expect(NEN_TYPES).toContain(c.nenType);
        }
      }
    });

    it('commitment軸のpositiveがenhancementに寄与する', () => {
      const contribution = AXIS_CONTRIBUTIONS.commitment;
      const enhancementContrib = contribution.positive.find((c) => c.nenType === 'enhancement');
      expect(enhancementContrib).toBeDefined();
      expect(enhancementContrib?.weight).toBeGreaterThan(0);
    });

    it('commitment軸のnegativeがtransmutationに寄与する', () => {
      const contribution = AXIS_CONTRIBUTIONS.commitment;
      const transmutationContrib = contribution.negative.find((c) => c.nenType === 'transmutation');
      expect(transmutationContrib).toBeDefined();
      expect(transmutationContrib?.weight).toBeGreaterThan(0);
    });

    it('caution軸のnegativeがemissionに寄与する', () => {
      const contribution = AXIS_CONTRIBUTIONS.caution;
      const emissionContrib = contribution.negative.find((c) => c.nenType === 'emission');
      expect(emissionContrib).toBeDefined();
      expect(emissionContrib?.weight).toBeGreaterThan(0);
    });

    it('independence軸とcharisma軸がspecializationに寄与する', () => {
      const independenceContrib = AXIS_CONTRIBUTIONS.independence;
      const charismaContrib = AXIS_CONTRIBUTIONS.charisma;

      const independenceSpecial = independenceContrib.positive.find(
        (c) => c.nenType === 'specialization',
      );
      const charismaSpecial = charismaContrib.positive.find((c) => c.nenType === 'specialization');

      expect(independenceSpecial).toBeDefined();
      expect(charismaSpecial).toBeDefined();
    });
  });

  describe('JudgmentAxis.all', () => {
    it('全ての判断軸を返す', () => {
      const axes = JudgmentAxis.all();
      expect(axes).toEqual(JUDGMENT_AXES);
    });
  });

  describe('JudgmentAxis.getInfo', () => {
    it('指定した軸のAxisInfoを返す', () => {
      const info = JudgmentAxis.getInfo('commitment');
      expect(info).toBe(AXIS_INFO.commitment);
    });

    it('全ての軸に対して正しいInfoを返す', () => {
      for (const axis of JUDGMENT_AXES) {
        const info = JudgmentAxis.getInfo(axis);
        expect(info.id).toBe(axis);
      }
    });
  });

  describe('JudgmentAxis.getContribution', () => {
    it('指定した軸のContributionを返す', () => {
      const contribution = JudgmentAxis.getContribution('commitment');
      expect(contribution).toBe(AXIS_CONTRIBUTIONS.commitment);
    });

    it('全ての軸に対して正しいContributionを返す', () => {
      for (const axis of JUDGMENT_AXES) {
        const contribution = JudgmentAxis.getContribution(axis);
        expect(contribution).toBe(AXIS_CONTRIBUTIONS[axis]);
      }
    });
  });
});
