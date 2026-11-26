import { describe, expect, it } from 'vitest';

import {
  buriedDrift,
  carry,
  coverage,
  createWaves,
  type Drift,
  ebb,
  frontOf,
  initialDrift,
  packWaves,
  submerged,
  type Swash,
  visibility,
  WAVE_SLOTS,
} from './wave';

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

/** `until` 秒までに岸へ届く波を、すべて集める */
const collect = (until: number, random: () => number): readonly Swash[] => {
  const waves = createWaves(random);
  const found = new Map<number, Swash>();
  for (let time = 0; time <= until; time += 1) {
    for (const swash of waves.visibleAt(time)) found.set(swash.index, swash);
  }
  return [...found.values()];
};

/** うねりも傾きもない波。10 秒に岸へ届き、2 秒で距離 1 をのぼり、3 秒かけて引く */
const plain: Swash = {
  index: 1,
  arrival: 10,
  reach: 1,
  uprush: 2,
  backwash: 3,
  skew: 0,
  phases: [0, 0, 0],
};

describe('frontOf', () => {
  it('岸に届く前と、引ききったあとは水がない', () => {
    expect(frontOf(plain, 9.9, 0)).toBeUndefined();
    expect(frontOf(plain, 15.1, 0)).toBeUndefined();
  });

  it('岸に届いたときは凪の波打ち際にいて、寄せきると、のぼる距離まで届く', () => {
    expect(frontOf(plain, 10, 0)).toBeCloseTo(0);
    expect(frontOf(plain, 12, 0)).toBeCloseTo(1);
  });

  it('速く寄せて止まる。寄せる時間の半分で、距離の 3/4 をのぼる', () => {
    expect(frontOf(plain, 11, 0)).toBeCloseTo(0.75);
  });

  it('加速しながら引く。引く時間の半分では、まだ距離の 1/4 しか引いていない', () => {
    expect(frontOf(plain, 13.5, 0)).toBeCloseTo(0.75);
    expect(frontOf(plain, 15, 0)).toBeCloseTo(0);
  });

  it('斜めに届く波は、岸沿いに進んだ先ほど遅れて届く', () => {
    const skewed: Swash = { ...plain, skew: 0.5 };
    expect(frontOf(skewed, 10.2, 0)).toBeGreaterThan(0);
    expect(frontOf(skewed, 10.2, 2)).toBeUndefined();
  });
});

describe('createWaves', () => {
  it('読み込み直後は、最初の大きな波がエビの位置を越えて寄せている', () => {
    const visible = createWaves(seeded(1)).visibleAt(0);
    const first = visible[0];
    expect(visible).toHaveLength(1);
    expect(first?.index).toBe(0);
    expect(first?.reach).toBe(1.5);
    expect((first?.arrival ?? 0) + (first?.uprush ?? 0)).toBeCloseTo(1.6);
    expect(first && frontOf(first, 0, 0)).toBeGreaterThan(0.66);
  });

  it('沖から来る波は、岸に届く 3 秒前から追う', () => {
    const waves = createWaves(seeded(1));
    expect(waves.visibleAt(4.1)).toHaveLength(1);
    const visible = waves.visibleAt(4.3);
    expect(visible).toHaveLength(2);
    expect(visible[1]?.arrival).toBe(7.2);
  });

  it('同時に追う波は 4 つまでで、古い順に並ぶ', () => {
    const visible = createWaves(seeded(7)).visibleAt(100);
    const newest = visible.at(-1)?.index ?? 0;
    expect(visible).toHaveLength(WAVE_SLOTS);
    expect(visible.map((swash) => swash.index)).toEqual([
      newest - 3,
      newest - 2,
      newest - 1,
      newest,
    ]);
  });

  it('一度決めた波は、先の時刻を見たあとに見直しても変わらない', () => {
    const waves = createWaves(seeded(7));
    const first = waves.visibleAt(30);
    waves.visibleAt(300);
    expect(waves.visibleAt(30)).toEqual(first);
  });

  it('波の大きさと間隔は毎回ちがい、決めた範囲に収まる', () => {
    const swashes = collect(600, seeded(11));
    const later = swashes.slice(2);
    const gaps = later.map(
      (swash, i) => swash.arrival - (swashes[i + 1]?.arrival ?? 0),
    );
    expect(later.length).toBeGreaterThan(50);
    // 上限や下限に張りつく波はあるが、ほとんどの波は大きさがちがう
    expect(new Set(later.map((swash) => swash.reach)).size).toBeGreaterThan(
      later.length * 0.8,
    );
    for (const swash of later) {
      expect(swash.reach).toBeGreaterThanOrEqual(0.5);
      expect(swash.reach).toBeLessThanOrEqual(1.3);
      expect(swash.uprush).toBeCloseTo(2.6 * Math.sqrt(swash.reach));
      expect(swash.backwash).toBeCloseTo(1.3 * swash.uprush);
    }
    expect(Math.min(...gaps)).toBeGreaterThan(5.8);
    expect(Math.max(...gaps)).toBeLessThan(10.1);
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

describe('carry（砂に埋もれたエビ）', () => {
  const run = (seconds: number, from = 20): Drift => {
    const waves = createWaves(seeded(3));
    let drift = buriedDrift;
    for (let time = from; time < from + seconds; time += 1 / 30) {
      drift = carry(drift, time, time + 1 / 30, waves);
    }
    return drift;
  };

  it('波に洗われるたびに少しずつ現れ、現れきるまでは動かない', () => {
    let previous = 1;
    let emerging = 0;
    for (const seconds of [10, 20, 30, 40, 50, 60]) {
      const drift = run(seconds);
      expect(drift.buried).toBeLessThanOrEqual(previous);
      if (drift.buried > 0) {
        expect(drift.seaward).toBe(0);
        expect(drift.gone).toBe(false);
      }
      if (drift.buried > 0 && drift.buried < 1) emerging += 1;
      previous = drift.buried;
    }
    expect(emerging).toBeGreaterThan(0);
  });

  it('どの波の列でも、1 つの波では現れきらず、やがて現れきる', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const waves = createWaves(seeded(seed));
      let drift = buriedDrift;
      let changes = 0;
      for (let time = 20; time < 140; time += 1) {
        const next = carry(drift, time, time + 1, waves);
        if (next.buried < drift.buried) changes += 1;
        drift = next;
      }
      expect(drift.buried).toBe(0);
      expect(changes).toBeGreaterThan(3);
    }
  });

  it('現れきったあとは、ほかのエビと同じく波に攫われる', () => {
    expect(run(400).gone).toBe(true);
  });

  it('スクロールの引き潮では動かない', () => {
    expect(ebb(buriedDrift, 1, 0)).toBe(buriedDrift);
  });
});

describe('ebb', () => {
  it('満ちきった潮が引くと、戻りきる前にエビは海へ消える', () => {
    expect(ebb(initialDrift, 1, 0.75).gone).toBe(false);
    expect(ebb(initialDrift, 1, 0.6).gone).toBe(true);
    expect(ebb(initialDrift, 1, 0).gone).toBe(true);
  });

  it('エビをすっかり覆った潮なら、途中まで満ちただけでも攫う', () => {
    expect(ebb(initialDrift, 0.35, 0).gone).toBe(true);
  });

  it('潮がエビに届いていなければ動かない', () => {
    expect(ebb(initialDrift, 0.2, 0)).toBe(initialDrift);
  });

  it('浅くかぶっただけなら、少し沖へずれて浜に残る', () => {
    const nudged = ebb(initialDrift, 0.25, 0);
    expect(nudged.seaward).toBeGreaterThan(0);
    expect(nudged.seaward).toBeLessThan(0.3);
    expect(nudged.gone).toBe(false);
  });

  it('潮が満ちていく間は動かない', () => {
    expect(ebb(initialDrift, 0, 1)).toBe(initialDrift);
    expect(ebb(initialDrift, 0.5, 0.5)).toBe(initialDrift);
  });

  it('少しずつ引いても、一気に引いても、ほぼ同じところへ運ぶ', () => {
    let gradual = initialDrift;
    for (let tide = 1; tide > 0.8 + 1e-9; tide -= 0.004) {
      gradual = ebb(gradual, tide, tide - 0.004);
    }
    expect(gradual.seaward).toBeCloseTo(ebb(initialDrift, 1, 0.8).seaward, 1);
  });

  it('消えたあとは動かない', () => {
    const gone: Drift = { ...initialDrift, seaward: 2, gone: true };
    expect(ebb(gone, 1, 0)).toBe(gone);
  });
});

describe('coverage', () => {
  it('波をかぶっていれば 1、波が届いていなければ 0', () => {
    const waves = createWaves(seeded(1));
    expect(coverage(initialDrift, waves.visibleAt(1.6), 1.6, 0)).toBe(1);
    expect(coverage(initialDrift, waves.visibleAt(6.5), 6.5, 0)).toBe(0);
  });

  it('潮が満ちると、波が引いていても水をかぶる', () => {
    const waves = createWaves(seeded(1));
    expect(coverage(initialDrift, waves.visibleAt(6.5), 6.5, 1)).toBe(1);
  });
});

describe('visibility', () => {
  it('浜にいる間ははっきり見え、沖へ出るほど薄れ、消えたら 0', () => {
    expect(visibility(initialDrift)).toBe(1);
    expect(visibility({ ...initialDrift, seaward: 1.05 })).toBeCloseTo(0.5);
    expect(visibility({ ...initialDrift, seaward: 2, gone: true })).toBe(0);
  });
});

describe('packWaves', () => {
  const tilted: Swash = { ...plain, skew: 0.25, phases: [1, 2, 3] };
  const slot = (values: Float32Array, index: number): readonly number[] => [
    ...values.slice(index * 4, index * 4 + 4),
  ];

  it('時刻は、岸に届いてからの秒数に直して渡す', () => {
    const { motion, shape } = packWaves([tilted], 12);
    expect(slot(motion, WAVE_SLOTS - 1)).toEqual([2, 1, 2, 3]);
    expect(slot(shape, WAVE_SLOTS - 1)).toEqual([0.25, 1, 2, 3]);
  });

  it('足りない分は、先頭をとうに引ききった波で埋める', () => {
    const { motion, shape } = packWaves([tilted], 12);
    const spent = slot(motion, 0);
    expect(motion).toHaveLength(WAVE_SLOTS * 4);
    expect(spent[0]).toBeGreaterThan((spent[2] ?? 0) + (spent[3] ?? 0) + 100);
    expect(slot(shape, 0)).toEqual([0, 0, 0, 0]);
  });

  it('枠より多く渡されたら、新しいほうだけを詰める', () => {
    const swashes = [0, 1, 2, 3, 4].map((index): Swash => ({
      ...plain,
      index,
      arrival: index * 8,
    }));
    const { motion } = packWaves(swashes, 40);
    expect(slot(motion, 0)[0]).toBe(32);
    expect(slot(motion, WAVE_SLOTS - 1)[0]).toBe(8);
  });
});

describe('submerged', () => {
  /** 凪の波打ち際から、沖へ `seaward` だけ離れた地点（岸沿いの位置は 0） */
  const offshore = (seaward: number): readonly [number, number] => [
    0.8944 * (0.66 + seaward),
    -0.4472 * (0.66 + seaward),
  ];

  it('波が引いている間は、凪の波打ち際より沖が水の中で、エビのいる浜は水の外', () => {
    const waves = createWaves(seeded(1));
    const swashes = waves.visibleAt(6.5);
    expect(submerged(...offshore(0.3), swashes, 6.5, 0)).toBe(true);
    expect(submerged(0, 0, swashes, 6.5, 0)).toBe(false);
    expect(submerged(...offshore(-0.3), swashes, 6.5, 0)).toBe(false);
  });

  it('波が寄せきったときは、エビのいる浜まで水の中', () => {
    const waves = createWaves(seeded(1));
    expect(submerged(0, 0, waves.visibleAt(1.6), 1.6, 0)).toBe(true);
  });

  it('潮が満ちると、波がなくても浜まで水の中', () => {
    const waves = createWaves(seeded(1));
    expect(submerged(0, 0, waves.visibleAt(6.5), 6.5, 1)).toBe(true);
  });
});
