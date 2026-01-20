import { describe, expect, it } from 'vitest';

import { NEN_TYPES, NenType, type NenTypeInfo } from './nenType.ts';

describe('NenType', () => {
  describe('NEN_TYPES', () => {
    it('6つの念タイプが定義されている', () => {
      expect(NEN_TYPES).toHaveLength(6);
    });

    it('必要な念タイプが全て含まれている', () => {
      const expectedTypes = [
        'enhancement',
        'transmutation',
        'emission',
        'manipulation',
        'conjuration',
        'specialization',
      ];
      expect([...NEN_TYPES]).toEqual(expectedTypes);
    });
  });

  describe('NenType.all', () => {
    it('全ての念タイプを返す', () => {
      const types = NenType.all();
      expect(types).toEqual(NEN_TYPES);
    });
  });

  describe('NenType.getInfo', () => {
    it('全ての念タイプに対してNenTypeInfoを返す', () => {
      for (const type of NEN_TYPES) {
        const info = NenType.getInfo(type);
        expect(info).toBeDefined();
      }
    });

    it('NenTypeInfoに必要なプロパティが全て含まれている', () => {
      for (const type of NEN_TYPES) {
        const info: NenTypeInfo = NenType.getInfo(type);
        expect(info.id).toBe(type);
        expect(typeof info.name).toBe('string');
        expect(info.name.length).toBeGreaterThan(0);
        expect(typeof info.japaneseName).toBe('string');
        expect(info.japaneseName.length).toBeGreaterThan(0);
        expect(typeof info.description).toBe('string');
        expect(info.description.length).toBeGreaterThan(0);
        expect(typeof info.personality).toBe('string');
        expect(info.personality.length).toBeGreaterThan(0);
        expect(typeof info.waterDivinationResult).toBe('string');
        expect(info.waterDivinationResult.length).toBeGreaterThan(0);
        expect(Array.isArray(info.compatibleTypes)).toBe(true);
        expect(Array.isArray(info.incompatibleTypes)).toBe(true);
        expect(typeof info.color).toBe('string');
        expect(typeof info.bgColor).toBe('string');
      }
    });

    it('各念タイプの日本語名が適切に設定されている', () => {
      expect(NenType.getInfo('enhancement').japaneseName).toBe('強化系');
      expect(NenType.getInfo('transmutation').japaneseName).toBe('変化系');
      expect(NenType.getInfo('emission').japaneseName).toBe('放出系');
      expect(NenType.getInfo('manipulation').japaneseName).toBe('操作系');
      expect(NenType.getInfo('conjuration').japaneseName).toBe('具現化系');
      expect(NenType.getInfo('specialization').japaneseName).toBe('特質系');
    });

    it('色コードが有効なHex形式である', () => {
      const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
      for (const type of NEN_TYPES) {
        const info = NenType.getInfo(type);
        expect(info.color).toMatch(hexColorRegex);
      }
    });

    it('compatibleTypesに自身が含まれている', () => {
      for (const type of NEN_TYPES) {
        const info = NenType.getInfo(type);
        expect(info.compatibleTypes).toContain(type);
      }
    });

    it('compatibleTypesとincompatibleTypesに重複がない', () => {
      for (const type of NEN_TYPES) {
        const info = NenType.getInfo(type);
        const compatible = new Set(info.compatibleTypes);
        const incompatible = new Set(info.incompatibleTypes);
        const intersection = [...compatible].filter((t) => incompatible.has(t));
        expect(intersection).toHaveLength(0);
      }
    });

    it('compatibleTypesとincompatibleTypesが有効な念タイプを参照している', () => {
      for (const type of NEN_TYPES) {
        const info = NenType.getInfo(type);
        for (const compatible of info.compatibleTypes) {
          expect(NEN_TYPES).toContain(compatible);
        }
        for (const incompatible of info.incompatibleTypes) {
          expect(NEN_TYPES).toContain(incompatible);
        }
      }
    });
  });

  describe('念タイプの水見式結果', () => {
    it('強化系は水が溢れる', () => {
      const info = NenType.getInfo('enhancement');
      expect(info.waterDivinationResult).toBe('コップの水が溢れる');
    });

    it('変化系は水の味が変わる', () => {
      const info = NenType.getInfo('transmutation');
      expect(info.waterDivinationResult).toBe('水の味が変わる');
    });

    it('放出系は水の色が変わる', () => {
      const info = NenType.getInfo('emission');
      expect(info.waterDivinationResult).toBe('水の色が変わる');
    });

    it('操作系は葉っぱが動く', () => {
      const info = NenType.getInfo('manipulation');
      expect(info.waterDivinationResult).toBe('葉っぱが水面で動く');
    });

    it('具現化系は不純物が現れる', () => {
      const info = NenType.getInfo('conjuration');
      expect(info.waterDivinationResult).toBe('水中に不純物が現れる');
    });

    it('特質系は予測不能な変化', () => {
      const info = NenType.getInfo('specialization');
      expect(info.waterDivinationResult).toBe('予測不能な変化が起こる');
    });
  });

  describe('念タイプの相性関係', () => {
    it('強化系と特質系は相性が悪い', () => {
      const enhancementInfo = NenType.getInfo('enhancement');
      const specializationInfo = NenType.getInfo('specialization');

      expect(enhancementInfo.incompatibleTypes).toContain('specialization');
      expect(specializationInfo.incompatibleTypes).toContain('enhancement');
    });

    it('変化系と放出系は相性が悪い', () => {
      const transmutationInfo = NenType.getInfo('transmutation');
      const emissionInfo = NenType.getInfo('emission');

      expect(transmutationInfo.incompatibleTypes).toContain('emission');
      expect(emissionInfo.incompatibleTypes).toContain('transmutation');
    });

    it('操作系と具現化系は相性が悪い', () => {
      const manipulationInfo = NenType.getInfo('manipulation');
      const conjurationInfo = NenType.getInfo('conjuration');

      expect(manipulationInfo.incompatibleTypes).toContain('conjuration');
      expect(conjurationInfo.incompatibleTypes).toContain('manipulation');
    });

    it('強化系は変化系と放出系と相性が良い', () => {
      const info = NenType.getInfo('enhancement');
      expect(info.compatibleTypes).toContain('transmutation');
      expect(info.compatibleTypes).toContain('emission');
    });
  });
});
