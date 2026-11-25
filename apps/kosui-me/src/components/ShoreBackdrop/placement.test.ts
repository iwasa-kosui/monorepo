import { describe, expect, it } from 'vitest';

import { EBB_LINE } from '../ShoreHero/wave';
import { placeSea } from './placement';

/** 枠の上端で、凪の波打ち際が通る位置（枠の左端からの px）。shader.ts の式を上端の高さで解いたもの */
const waterlineAtTop = (width: number): number => {
  const [left, top, unit] = placeSea(width);
  const centerX = left + unit / 2;
  const centerY = top + unit / 2;
  return centerX + (EBB_LINE * unit - 0.4472 * centerY) / 0.8944;
};

describe('placeSea', () => {
  it.each([160, 390, 368, 608, 1200])(
    '幅 %i の枠で、凪の波打ち際は上端の右寄りを通り、海は枠の中に見える',
    (width) => {
      const waterline = waterlineAtTop(width);
      expect(waterline).toBeLessThan(width);
      expect(waterline).toBeGreaterThan(width / 2);
    },
  );

  it('縮尺は枠の幅に合わせて変わり、下限と上限で止まる', () => {
    expect(placeSea(100)[2]).toBe(120);
    expect(placeSea(400)[2]).toBeCloseTo(160);
    expect(placeSea(2000)[2]).toBe(240);
  });

  it('正方形の中心は、枠の上端にある', () => {
    const [, top, unit] = placeSea(400);
    expect(top + unit / 2).toBe(0);
  });
});
