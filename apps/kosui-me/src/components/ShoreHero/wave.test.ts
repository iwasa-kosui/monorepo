import { describe, expect, it } from 'vitest';

import { carry, coverage, createWaves, type Drift, initialDrift, swashProfile, visibility, WAVE_PERIOD } from './wave';

/** 再現できる乱数 */
const seeded = (seed: number): () => number => {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
};

/** `seconds` 秒ぶんを、毎秒 60 コマで進める */
const run = (seconds: number, random: () => number): Drift => {
  const waves = createWaves(random);
  let drift = initialDrift;
  const frame = 1 / 60;
  for (let time = 0; time < seconds; time += frame) {
    drift = carry(drift, time, time + frame, waves);
  }
  return drift;
};

describe('swashProfile', () => {
  it('周期の始めと終わりでは波が引ききっている', () => {
    expect(swashProfile(0)).toBe(0);
    expect(swashProfile(1)).toBe(0);
  });

  it('周期の 36% で寄せきる', () => {
    expect(swashProfile(0.36)).toBeCloseTo(1);
  });

  it('寄せるほうが引くより速い', () => {
    expect(swashProfile(0.18)).toBeGreaterThan(swashProfile(0.68));
  });
});

describe('createWaves', () => {
  it('読み込み直後は、最初の大きな波がほぼ寄せきっている', () => {
    const wave = createWaves(seeded(1)).at(0);
    expect(wave.cycle).toBe(0);
    expect(wave.amplitude).toBe(1.2);
    expect(wave.line).toBeLessThan(-0.9);
  });

  it('一度決めた波の強さは、同じ波を見直しても変わらない', () => {
    const waves = createWaves(seeded(7));
    const first = waves.at(WAVE_PERIOD * 3).amplitude;
    waves.at(WAVE_PERIOD * 9);
    expect(waves.at(WAVE_PERIOD * 3).amplitude).toBe(first);
  });

  it('1 つ前の波の強さを返す', () => {
    const waves = createWaves(seeded(7));
    const third = waves.at(WAVE_PERIOD * 2);
    const fourth = waves.at(WAVE_PERIOD * 3);
    expect(fourth.previousAmplitude).toBe(third.amplitude);
  });
});

describe('carry', () => {
  it('最初の波の間は、エビを攫わない', () => {
    expect(run(6.5, seeded(3))).toEqual(initialDrift);
  });

  it('波を重ねるごとに沖へ出ていく', () => {
    const early = run(30, seeded(3));
    const later = run(50, seeded(3));
    expect(early.seaward).toBeGreaterThan(0);
    expect(later.seaward).toBeGreaterThan(early.seaward);
    expect(early.gone).toBe(false);
  });

  it.each([3, 11, 97, 2024])(
    '1 分から 3 分のうちに海へ消える（乱数の種 %i）',
    (seed) => {
      expect(run(60, seeded(seed)).gone).toBe(false);
      expect(run(180, seeded(seed)).gone).toBe(true);
    },
  );

  it('消えたあとは動かない', () => {
    const waves = createWaves(seeded(3));
    const gone: Drift = { ...initialDrift, seaward: 2, gone: true };
    expect(carry(gone, 100, 101, waves)).toBe(gone);
  });

  it('長く止まっていた間の動きは捨てる', () => {
    const waves = createWaves(seeded(3));
    const drift: Drift = { ...initialDrift, seaward: 0.3 };
    expect(carry(drift, 20, 80, waves)).toBe(drift);
  });

  it('コマの間隔が粗くても、進む距離はほぼ変わらない', () => {
    const fine = run(40, seeded(5));
    const waves = createWaves(seeded(5));
    let coarse = initialDrift;
    for (let time = 0; time < 40; time += 0.5) {
      coarse = carry(coarse, time, time + 0.5, waves);
    }
    expect(coarse.seaward).toBeCloseTo(fine.seaward, 1);
  });
});

describe('coverage', () => {
  it('波が届いていなければ 0、深くかぶれば 1', () => {
    const waves = createWaves(seeded(1));
    const peak = waves.at(0.6);
    const ebb = waves.at(6.9);
    expect(coverage(initialDrift, peak, 0)).toBe(1);
    expect(coverage(initialDrift, ebb, 0)).toBe(0);
  });

  it('潮が満ちると、引き波のときでも水をかぶる', () => {
    const ebb = createWaves(seeded(1)).at(6.9);
    expect(coverage(initialDrift, ebb, 1)).toBe(1);
  });
});

describe('visibility', () => {
  it('浜にいる間ははっきり見え、沖へ出るほど薄れ、消えたら 0', () => {
    expect(visibility(initialDrift)).toBe(1);
    expect(visibility({ ...initialDrift, seaward: 1.05 })).toBeCloseTo(0.5);
    expect(visibility({ ...initialDrift, seaward: 2, gone: true })).toBe(0);
  });
});
