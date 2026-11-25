import { describe, expect, it } from 'vitest';

import { buildPatternTexture, PATTERN_SIZE } from './pattern';

const HOLES_LARGE = 0;
const HOLES_SMALL = 1;
const MOTTLE_B = 2;
const MOTTLE_A = 3;
const CHANNELS = [HOLES_LARGE, HOLES_SMALL, MOTTLE_B, MOTTLE_A] as const;

describe('buildPatternTexture', () => {
  const data = buildPatternTexture();
  const at = (x: number, y: number, channel: number): number => data[(y * PATTERN_SIZE + x) * 4 + channel];
  const channelValues = (channel: number): readonly number[] =>
    Array.from(
      { length: PATTERN_SIZE * PATTERN_SIZE },
      (_, i) => data[i * 4 + channel],
    );
  const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

  it('RGBA の正方形で返す', () => {
    expect(data).toHaveLength(PATTERN_SIZE * PATTERN_SIZE * 4);
  });

  it('何度作っても同じ模様になる', () => {
    expect(buildPatternTexture()).toEqual(data);
  });

  it.each(CHANNELS)(
    '左右と上下の端がつながる（チャンネル %i）',
    (channel) => {
      const steps = Array.from({ length: PATTERN_SIZE }, (_, k) => k);
      const last = PATTERN_SIZE - 1;
      const middle = PATTERN_SIZE / 2;
      // 端をまたぐ差が、内側の隣どうしの差と同じ程度に収まる
      const acrossSeam = mean([
        ...steps.map((k) => Math.abs(at(last, k, channel) - at(0, k, channel))),
        ...steps.map((k) => Math.abs(at(k, last, channel) - at(k, 0, channel))),
      ]);
      const inside = mean([
        ...steps.map((k) => Math.abs(at(middle - 1, k, channel) - at(middle, k, channel))),
        ...steps.map((k) => Math.abs(at(k, middle - 1, channel) - at(k, middle, channel))),
      ]);
      expect(acrossSeam).toBeLessThan(inside * 1.5 + 1);
    },
  );

  it.each([HOLES_LARGE, HOLES_SMALL])(
    '泡の穴は、中心で 0 になり、穴から離れた泡の筋で大きくなる（チャンネル %i）',
    (channel) => {
      const values = channelValues(channel);
      expect(Math.min(...values)).toBeLessThan(8);
      expect(Math.max(...values)).toBeGreaterThan(200);
    },
  );

  it.each([MOTTLE_B, MOTTLE_A])(
    'むらは、白にも黒にも張りつかず、中ほどに広がる（チャンネル %i）',
    (channel) => {
      const values = channelValues(channel);
      expect(Math.min(...values)).toBeGreaterThan(16);
      expect(Math.max(...values)).toBeLessThan(240);
      expect(mean(values)).toBeGreaterThan(96);
      expect(mean(values)).toBeLessThan(176);
    },
  );
});
