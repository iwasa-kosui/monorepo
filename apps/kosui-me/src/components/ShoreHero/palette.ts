import type { Palette } from './renderer';

/**
 * 海辺の配色の切り替え。海を押すたびに、次の配色へ変わる。
 * 色の値は global.css の .shore-palette にある。ここでは、名前の順番と、色の移り変わりだけを扱う。
 */

/**
 * 配色の名前。海を押すたびに、この順に切り替わる。先頭が、はじめの配色。
 * 珊瑚（珊瑚色の海）、夏の青、礁湖、紺碧、朝凪
 */
export const SHORE_PALETTES = [
  'sango',
  'natsu',
  'shoko',
  'konpeki',
  'asanagi',
] as const;

export type ShorePaletteName = (typeof SHORE_PALETTES)[number];

export const INITIAL_PALETTE: ShorePaletteName = SHORE_PALETTES[0];

/** `current` の次の配色。最後まで行くと、はじめに戻る */
export const nextPalette = (current: ShorePaletteName): ShorePaletteName =>
  SHORE_PALETTES[(SHORE_PALETTES.indexOf(current) + 1) % SHORE_PALETTES.length]
    ?? INITIAL_PALETTE;

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
