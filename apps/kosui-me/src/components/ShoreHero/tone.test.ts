import { describe, expect, it } from 'vitest';

import { INITIAL_SEA_HUE, oklchToHex, randomTone, type ShoreTone, toneColors } from './tone';

/** 再現できる乱数 */
const seeded = (seed: number): () => number => {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
};

/** 16 進 6 桁の色の、見た目の明るさ（WCAG の相対輝度。0 = 黒、1 = 白） */
const luminance = (hex: string): number => {
  const channel = (index: number): number => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
};

/** 2 つの色のコントラスト比（WCAG） */
const contrast = (a: string, b: string): number => {
  const [dark, light] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
};

/** 色相の差（0〜180 度） */
const hueGap = (a: number, b: number): number => {
  const gap = Math.abs(a - b) % 360;
  return Math.min(gap, 360 - gap);
};

/** でたらめな配色のもとを `count` 個、続けて作る */
const tones = (count: number, seed: number): readonly ShoreTone[] => {
  const random = seeded(seed);
  const result: ShoreTone[] = [];
  let hue = INITIAL_SEA_HUE;
  for (let i = 0; i < count; i++) {
    const tone = randomTone(random, hue);
    result.push(tone);
    hue = tone.seaHue;
  }
  return result;
};

describe('oklchToHex', () => {
  it('白・黒・灰色を、そのままの色で返す', () => {
    expect(oklchToHex(1, 0, 0)).toBe('#ffffff');
    expect(oklchToHex(0, 0, 0)).toBe('#000000');
    expect(oklchToHex(0.5999, 0, 0)).toBe('#808080');
  });

  it('画面で表せない鮮やかさでも、16 進 6 桁の色を返す', () => {
    for (let hue = 0; hue < 360; hue += 15) {
      expect(oklchToHex(0.4, 0.4, hue)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('randomTone', () => {
  it('海の色相は、押すたびに前の色から離れる', () => {
    let previous = INITIAL_SEA_HUE;
    for (const tone of tones(200, 7)) {
      expect(tone.seaHue).toBeGreaterThanOrEqual(0);
      expect(tone.seaHue).toBeLessThan(360);
      expect(hueGap(tone.seaHue, previous)).toBeGreaterThanOrEqual(49.9);
      previous = tone.seaHue;
    }
  });

  it('海の色相に、茶色く濁る黄から橙のあたりを使わない', () => {
    const usable = (hue: number): boolean => {
      const turned = ((hue % 360) + 360) % 360;
      return turned >= 119.999 || turned <= 40.001;
    };
    for (const tone of tones(500, 19)) {
      expect(usable(tone.seaHue)).toBe(true);
      expect(usable(tone.seaHue + tone.deepShift)).toBe(true);
    }
  });
});

describe('toneColors', () => {
  it('どの色も 16 進 6 桁で返す（シェーダーがそのまま読める）', () => {
    for (const tone of tones(50, 3)) {
      for (const dark of [false, true]) {
        for (const color of Object.values(toneColors(tone, dark))) {
          expect(color).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    }
  });

  it('昼の浜は、どの色相でも本文と補足の文字が読める明るさ', () => {
    for (const tone of tones(300, 11)) {
      const { sand } = toneColors(tone, false);
      expect(contrast(sand, '#1a1a2e')).toBeGreaterThan(12);
      expect(contrast(sand, '#5b6170')).toBeGreaterThan(4.5);
    }
  });

  it('夜の浜は、どの色相でも本文と補足の文字が読める暗さ', () => {
    for (const tone of tones(300, 13)) {
      const { sand } = toneColors(tone, true);
      expect(contrast(sand, '#c9c9d1')).toBeGreaterThan(7);
      expect(contrast(sand, '#9ca3af')).toBeGreaterThan(4.5);
    }
  });

  it('沖は浅瀬より暗い', () => {
    for (const tone of tones(300, 17)) {
      for (const dark of [false, true]) {
        const colors = toneColors(tone, dark);
        expect(luminance(colors.seaDeep)).toBeLessThan(luminance(colors.seaShallow));
      }
    }
  });
});
