import { describe, expect, it } from 'vitest';

import {
  isPullArmed,
  PULL_MAX_DISTANCE,
  PULL_TO_REFRESH_THRESHOLD,
  pullPhaseAfterRelease,
  pullProgress,
  rubberBand,
} from './pullGesture.ts';

describe('rubberBand', () => {
  it('引くほど重くなり、上限を越えない', () => {
    expect(rubberBand(0)).toBe(0);
    expect(rubberBand(-10)).toBe(0);
    expect(rubberBand(40)).toBeLessThan(40);
    expect(rubberBand(200) - rubberBand(160)).toBeLessThan(rubberBand(40) - rubberBand(0));
    expect(rubberBand(10_000)).toBeLessThanOrEqual(PULL_MAX_DISTANCE);
  });

  it('指を 90px ほど動かすとしきい値に届く', () => {
    expect(isPullArmed(rubberBand(80))).toBe(false);
    expect(isPullArmed(rubberBand(90))).toBe(true);
  });
});

describe('pullPhaseAfterRelease', () => {
  it('しきい値を越えて離したときだけ更新する', () => {
    expect(pullPhaseAfterRelease(PULL_TO_REFRESH_THRESHOLD)).toBe('refreshing');
    expect(pullPhaseAfterRelease(PULL_TO_REFRESH_THRESHOLD - 1)).toBe('idle');
  });
});

describe('pullProgress', () => {
  it('0〜1 に収める', () => {
    expect(pullProgress(0)).toBe(0);
    expect(pullProgress(PULL_TO_REFRESH_THRESHOLD / 2)).toBe(0.5);
    expect(pullProgress(PULL_MAX_DISTANCE)).toBe(1);
  });
});
