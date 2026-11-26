import { describe, expect, it } from 'vitest';

import {
  createPaletteFade,
  INITIAL_PALETTE,
  mixPalette,
  nextPalette,
  PALETTE_FADE,
  SHORE_PALETTES,
  type ShorePaletteName,
} from './palette';
import type { Palette } from './renderer';

const flat = (value: number): Palette => ({
  sand: [value, value, value],
  seaShallow: [value, value, value],
  seaDeep: [value, value, value],
  foam: [value, value, value],
  light: [value, value, value],
  shell: [value, value, value],
  eye: [value, value, value],
  wetTint: [value, value, value],
  shadowTint: [value, value, value],
  gain: value,
  grain: value,
  sheen: value,
  froth: value,
});

describe('nextPalette', () => {
  it('はじめの配色から押していくと、すべての配色を 1 度ずつ通って、はじめに戻る', () => {
    const visited: ShorePaletteName[] = [];
    let name: ShorePaletteName = INITIAL_PALETTE;
    for (const _ of SHORE_PALETTES) {
      visited.push(name);
      name = nextPalette(name);
    }
    expect(visited).toEqual(SHORE_PALETTES);
    expect(name).toBe(INITIAL_PALETTE);
  });
});

describe('mixPalette', () => {
  it('色も強さも、進み具合に応じて混ぜる', () => {
    const mixed = mixPalette(flat(0), flat(1), 0.25);
    expect(mixed.seaDeep).toEqual([0.25, 0.25, 0.25]);
    expect(mixed.froth).toBe(0.25);
  });

  it('進み具合は 0〜1 に収める', () => {
    expect(mixPalette(flat(0), flat(1), -1)).toEqual(flat(0));
    expect(mixPalette(flat(0), flat(1), 2)).toEqual(flat(1));
  });
});

describe('createPaletteFade', () => {
  it('配色を変えると、少しずつ移り変わって、新しい配色に落ち着く', () => {
    const fade = createPaletteFade(flat(0));
    expect(fade.at(0)).toEqual(flat(0));
    fade.change(flat(1), 1000, false);
    expect(fade.at(1000)).toEqual(flat(0));
    expect(fade.at(1000 + PALETTE_FADE / 2).gain).toBeCloseTo(0.5);
    expect(fade.at(1000 + PALETTE_FADE)).toEqual(flat(1));
  });

  it('移り変わる途中で変え直しても、見せている色から続く', () => {
    const fade = createPaletteFade(flat(0));
    fade.change(flat(1), 0, false);
    const midway = fade.at(PALETTE_FADE / 2).gain;
    fade.change(flat(0), PALETTE_FADE / 2, false);
    expect(fade.at(PALETTE_FADE / 2).gain).toBeCloseTo(midway);
    expect(fade.at(PALETTE_FADE * 2)).toEqual(flat(0));
  });

  it('動きを減らす設定では、すぐに切り替える', () => {
    const fade = createPaletteFade(flat(0));
    fade.change(flat(1), 0, true);
    expect(fade.at(0)).toEqual(flat(1));
  });
});
