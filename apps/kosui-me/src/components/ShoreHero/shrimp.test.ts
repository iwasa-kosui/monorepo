import { describe, expect, it } from 'vitest';

import { buildShadowTexture, buildSpriteTexture, EYE_PATH, GRID, SHADOW_SIZE, SHELL_PATH } from './shrimp';

describe('buildSpriteTexture', () => {
  const data = buildSpriteTexture();
  const alphaAt = (x: number, y: number) => data[(y * GRID + x) * 4 + 3];
  const eyeAt = (x: number, y: number) => data[(y * GRID + x) * 4];

  it('殻 64 マスと目 1 マスを塗る', () => {
    const filled = Array.from(
      { length: GRID * GRID },
      (_, i) => data[i * 4 + 3],
    ).filter((alpha) => alpha === 255);
    expect(filled).toHaveLength(65);
  });

  it('目のマスだけに目の印を付ける', () => {
    const eyes = Array.from({ length: GRID * GRID }, (_, i) => data[i * 4])
      .filter((flag) => flag === 255);
    expect(eyes).toHaveLength(1);
    expect(eyeAt(7, 8)).toBe(255);
    expect(alphaAt(7, 8)).toBe(255);
  });

  it('絵の外は透明', () => {
    expect(alphaAt(0, 0)).toBe(0);
    expect(alphaAt(19, 19)).toBe(0);
  });
});

describe('buildShadowTexture', () => {
  const shadow = buildShadowTexture();

  it('余白込みの正方形で返す', () => {
    expect(shadow).toHaveLength(SHADOW_SIZE * SHADOW_SIZE);
  });

  it('胴の中心は濃く、端は影がない', () => {
    const at = (cellX: number, cellY: number) => shadow[((cellY + 2) * 4 + 2) * SHADOW_SIZE + (cellX + 2) * 4 + 2];
    expect(at(9, 11)).toBeGreaterThan(200);
    expect(shadow[0]).toBe(0);
  });
});

describe('SVG のパス', () => {
  it('殻は 31 個の連なり、目は 1 マス', () => {
    expect(SHELL_PATH.match(/M/g)).toHaveLength(31);
    expect(EYE_PATH).toBe('M7 8h1v1h-1z');
  });
});
