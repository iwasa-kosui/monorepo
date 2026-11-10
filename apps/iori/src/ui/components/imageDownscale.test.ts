import { describe, expect, it, vi } from 'vitest';

import {
  type Encode,
  fitWithin,
  needsDownscale,
  shrinkToFit,
  UPLOAD_MAX_LONG_EDGE,
  UPLOAD_TARGET_BYTES,
} from './imageDownscale.ts';

const blobOf = (bytes: number): Blob => new Blob([new Uint8Array(bytes)]);

describe('fitWithin', () => {
  it('縦横比を保ったまま長辺を上限に収める', () => {
    expect(fitWithin({ width: 4032, height: 3024 }, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin({ width: 3024, height: 4032 }, 2048)).toEqual({ width: 1536, height: 2048 });
  });

  it('拡大はしない', () => {
    expect(fitWithin({ width: 800, height: 600 }, 2048)).toEqual({ width: 800, height: 600 });
  });
});

describe('needsDownscale', () => {
  it('GIF はアニメーションを保つため縮小しない', () => {
    expect(needsDownscale({ type: 'image/gif', size: 5_000_000 })).toBe(false);
  });

  it('目標サイズを超えるファイルは縮小する', () => {
    expect(needsDownscale({ type: 'image/jpeg', size: UPLOAD_TARGET_BYTES + 1 })).toBe(true);
  });

  it('小さなファイルでも長辺が上限を超えれば縮小する', () => {
    expect(needsDownscale({ type: 'image/png', size: 10 }, { width: UPLOAD_MAX_LONG_EDGE + 1, height: 10 })).toBe(
      true,
    );
    expect(needsDownscale({ type: 'image/png', size: 10 }, { width: UPLOAD_MAX_LONG_EDGE, height: 10 })).toBe(false);
  });
});

describe('shrinkToFit', () => {
  it('目標サイズに収まった最初のエンコード結果を返す', async () => {
    const encode = vi.fn<Encode>().mockResolvedValue(blobOf(500_000));
    const blob = await shrinkToFit({ width: 4032, height: 3024 }, encode);
    expect(blob?.size).toBe(500_000);
    expect(encode).toHaveBeenCalledTimes(1);
    expect(encode).toHaveBeenCalledWith({ width: 2048, height: 1536 }, 0.85);
  });

  it('品質、次に寸法の順に落として収まるまで試す', async () => {
    const encode = vi.fn<Encode>(async (size, quality) =>
      blobOf(size.width >= 2048 ? 2_000_000 : quality > 0.7 ? 1_200_000 : 900_000)
    );
    const blob = await shrinkToFit({ width: 4032, height: 3024 }, encode);
    expect(blob?.size).toBe(900_000);
    expect(encode).toHaveBeenLastCalledWith({ width: 1638, height: 1229 }, 0.65);
  });

  it('どれも収まらなければ最小のエンコード結果を返す', async () => {
    let bytes = 3_000_000;
    const encode = vi.fn<Encode>(async () => blobOf(bytes -= 10_000));
    const blob = await shrinkToFit({ width: 4032, height: 3024 }, encode, 1);
    expect(blob?.size).toBe(bytes);
  });

  it('エンコードできなければ undefined を返す', async () => {
    expect(await shrinkToFit({ width: 100, height: 100 }, async () => null)).toBeUndefined();
  });
});
