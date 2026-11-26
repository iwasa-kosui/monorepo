import type { Palette } from './renderer';

/**
 * 海辺の配色の移り変わり。海を押すと配色が変わり（tone.ts）、色は少しずつ移り変わる。
 */

/** 配色が移り変わるのにかける時間（ミリ秒） */
export const PALETTE_FADE = 900;

type Rgb = Palette['sand'];
type ColorKey = { [K in keyof Palette]: Palette[K] extends Rgb ? K : never }[keyof Palette];
type NumberKey = Exclude<keyof Palette, ColorKey>;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const lerp = (from: number, to: number, ratio: number): number => from + (to - from) * ratio;

/** `from` から `to` へ、`progress`（0〜1）だけ進んだ配色 */
export const mixPalette = (
  from: Palette,
  to: Palette,
  progress: number,
): Palette => {
  const ratio = clamp01(progress);
  const color = (key: ColorKey): Rgb => [
    lerp(from[key][0], to[key][0], ratio),
    lerp(from[key][1], to[key][1], ratio),
    lerp(from[key][2], to[key][2], ratio),
  ];
  const number = (key: NumberKey): number => lerp(from[key], to[key], ratio);
  return {
    sand: color('sand'),
    seaShallow: color('seaShallow'),
    seaDeep: color('seaDeep'),
    foam: color('foam'),
    light: color('light'),
    shell: color('shell'),
    eye: color('eye'),
    wetTint: color('wetTint'),
    shadowTint: color('shadowTint'),
    gain: number('gain'),
    grain: number('grain'),
    sheen: number('sheen'),
    froth: number('froth'),
  };
};

export type PaletteFade = Readonly<{
  /** 時刻 `now`（ミリ秒）に見せる配色 */
  at: (now: number) => Palette;
  /**
   * 時刻 `now` から、配色を `target` へ変える。いま見せている配色から、少しずつ移り変わる。
   * `instant` なら、すぐに切り替える（動きを減らす設定のとき）
   */
  change: (target: Palette, now: number, instant: boolean) => void;
}>;

/** はじめは `initial` を見せる。配色を変えると、途中で変え直しても、見せている色から滑らかに続く */
export const createPaletteFade = (initial: Palette): PaletteFade => {
  let from = initial;
  let target = initial;
  let changedAt = -Infinity;
  const at = (now: number): Palette => {
    const progress = (now - changedAt) / PALETTE_FADE;
    if (progress >= 1) return target;
    // はじめと終わりをゆるやかにする
    const eased = progress * progress * (3 - 2 * progress);
    return mixPalette(from, target, eased);
  };
  return {
    at,
    change: (next, now, instant) => {
      from = instant ? next : at(now);
      target = next;
      changedAt = now;
    },
  };
};
