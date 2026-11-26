/**
 * 波の列と、エビが波に攫われていく動きの計算。
 *
 * 距離の単位はエビのドット絵 1 辺（20 マス）を 1 とする。
 * 波の先の位置は、凪の波打ち際を 0 とし、浜をのぼる向き（陸側）を正とする。
 * シェーダー（shader.ts）と同じ式を使う。変えるときは両方を直す。
 */

/** 凪の波打ち際から、エビの最初の位置（海の位置を決める正方形の中心）までの距離 */
export const EBB_LINE = 0.66;

/** 最初の波が浜をのぼる距離。この波だけ大きくして、エビを浜に置いていく */
const FIRST_REACH = 1.5;

/** 最初の波が寄せきる時刻（秒）。読み込み直後は、波が寄せている途中から始まる */
const FIRST_PEAK = 1.6;

/** 2 つ目の波が岸に届く時刻（秒）。それまでの間、エビは濡れた砂の上に残る */
const SECOND_ARRIVAL = 7.2;

/** 3 つ目からの波が浜をのぼる距離の、下限と上限 */
const MIN_REACH = 0.5;
const MAX_REACH = 1.3;

/** のぼる距離 1 の波が寄せきるまでの秒数。坂を上がる球と同じく、秒数は距離の平方根に比例する */
const UPRUSH_SECONDS = 2.6;

/** 引くのにかかる時間は、寄せるのにかかる時間の何倍か */
const BACKWASH_RATIO = 1.3;

/** 沖から来る波を、岸に届く何秒前から追うか */
const LEAD = 3;

/** 同時に追う波の数。シェーダーの配列の長さと同じ */
export const WAVE_SLOTS = 4;

/** 引き波がエビを沖へ引く割合 */
const BACKWASH_PULL = 0.3;

/** 寄せ波がエビを陸へ押す割合。引き波より小さいので、差し引きで沖へ出ていく */
const UPRUSH_PUSH = 0.09;

/** 水をかぶり始めてから、完全に流れに乗るまでの深さ */
const COVER_DEPTH = 0.2;

/** この距離まで沖へ出たら、海に消えたとみなす */
const GONE_AT = 1.3;

/** 沖へ出て見えなくなり始める距離と、消えきるまでの幅 */
const FADE_FROM = 0.8;
const FADE_SPAN = 0.5;

/** スクロールで潮が満ちるとき、波打ち際が陸側へ動く距離 */
const TIDE_REACH = 2.8;

/**
 * 引き潮がエビを沖へ引く割合。波打ち際が下がった距離の何倍、エビが沖へ動くか。
 * 1 より大きいので、潮にすっかり覆われたエビは、潮が引ききる前に必ず海へ消える
 */
const EBB_PULL = 1.6;

/**
 * 引き波が、埋もれたエビの上の砂をさらう割合。波の先がエビの上を 1 下がるごとに、どれだけ掘り出すか。
 * エビをしっかり覆う波で 3 つほどかかる
 */
const UNEARTH_RATE = 1.4;

/** 引き潮を積分するときの、波打ち際の刻み */
const EBB_STEP = 0.02;

/** 1 回の積分の刻み（秒） */
const STEP = 1 / 30;

/** これより長く止まっていた場合（タブを離れていた等）は、その間の動きを捨てる */
const MAX_GAP = 4;

const TURN = Math.PI * 2;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const clamp01 = (value: number): number => clamp(value, 0, 1);

/**
 * 1 つの波。沖から白波で届き、浜をのぼって止まり、引いていく。
 */
export type Swash = Readonly<{
  /** 何番目の波か（0 始まり） */
  index: number;
  /** 凪の波打ち際に届く時刻（秒） */
  arrival: number;
  /** 浜をのぼる距離 */
  reach: number;
  /** 寄せきるまでの秒数 */
  uprush: number;
  /** 寄せきってから、引ききるまでの秒数 */
  backwash: number;
  /** 岸沿いに 1 進むごとの、届く時刻の遅れ（秒）。波は岸に少し斜めに届く */
  skew: number;
  /** 岸沿いのうねりの位相（ラジアン）。のぼる距離のうねり 2 つと、届く時刻のうねり */
  phases: readonly [number, number, number];
}>;

export type Waves = Readonly<{
  /** `time` の時点で追っている波。古い順に、多くて WAVE_SLOTS 個 */
  visibleAt: (time: number) => readonly Swash[];
}>;

/**
 * `previous` の次の波を作る。大きさと間隔は毎回ちがい、数波ごとに大きな波の組が来る。
 * 大きな波のあとは、次の波までの間が少し長い。
 */
const nextSwash = (
  previous: Swash | undefined,
  setPhase: number,
  random: () => number,
): Swash => {
  const index = previous === undefined ? 0 : previous.index + 1;
  const reach = index === 0
    ? FIRST_REACH
    : index === 1
    ? 1 + 0.12 * random()
    : clamp(
      0.86 + 0.3 * Math.sin(index * 1.15 + setPhase) + 0.3 * (random() - 0.5),
      MIN_REACH,
      MAX_REACH,
    );
  const uprush = UPRUSH_SECONDS * Math.sqrt(reach);
  const arrival = previous === undefined
    ? FIRST_PEAK - uprush
    : index === 1
    ? SECOND_ARRIVAL
    : previous.arrival + 6.2 + 3.6 * random() + 0.8 * (previous.reach - 1);
  const skew = 0.5 * (random() - 0.5);
  return {
    index,
    arrival,
    reach,
    uprush,
    backwash: uprush * BACKWASH_RATIO,
    skew,
    phases: [TURN * random(), TURN * random(), TURN * random()],
  };
};

/**
 * 波の列を作る。波ごとの大きさと間隔は `random` で決め、一度決めた波は変えない。
 */
export const createWaves = (random: () => number): Waves => {
  const setPhase = TURN * random();
  const swashes: Swash[] = [nextSwash(undefined, setPhase, random)];
  return {
    visibleAt: (time) => {
      let last = swashes[swashes.length - 1];
      while (last !== undefined && last.arrival - LEAD <= time) {
        last = nextSwash(last, setPhase, random);
        swashes.push(last);
      }
      let count = swashes.length;
      while (count > 0 && (swashes[count - 1]?.arrival ?? 0) - LEAD > time) {
        count -= 1;
      }
      return swashes.slice(Math.max(0, count - WAVE_SLOTS), count);
    },
  };
};

/** 岸沿いの位置 `along` で、波が浜をのぼる距離。岸沿いにうねる */
const reachAt = (swash: Swash, along: number): number =>
  swash.reach
  * (1
    + 0.14 * Math.sin(along * 1.9 + swash.phases[0])
    + 0.07 * Math.sin(along * 4.3 + swash.phases[1]));

/** 岸沿いの位置 `along` に、波が届いてからの秒数 */
const sinceArrival = (swash: Swash, time: number, along: number): number =>
  time
  - swash.arrival
  - swash.skew * along
  - 0.3 * Math.sin(along * 1.3 + swash.phases[2]);

/**
 * 岸沿いの位置 `along` で、波の先が浜をのぼった距離。
 * 坂を上がる球のように、速く寄せて止まり、加速しながら引く。
 * まだ岸に届いていないか、引ききったあとは undefined を返す。
 */
export const frontOf = (
  swash: Swash,
  time: number,
  along: number,
): number | undefined => {
  const since = sinceArrival(swash, time, along);
  if (since < 0 || since > swash.uprush + swash.backwash) return undefined;
  const fromTurn = since < swash.uprush
    ? 1 - since / swash.uprush
    : (since - swash.uprush) / swash.backwash;
  return reachAt(swash, along) * (1 - fromTurn ** 2);
};

/** 岸沿いの位置 `along` で、水がいちばん陸側まで届いている距離。波がなければ凪の波打ち際（0） */
const waterReach = (
  swashes: readonly Swash[],
  time: number,
  along: number,
): number =>
  swashes.reduce(
    (reach, swash) => Math.max(reach, frontOf(swash, time, along) ?? 0),
    0,
  );

/** `position` まで水が届いている波のうち、いちばん新しいもの */
const newestOver = (
  swashes: readonly Swash[],
  time: number,
  along: number,
  position: number,
): Swash | undefined => {
  for (let i = swashes.length - 1; i >= 0; i--) {
    const swash = swashes[i];
    if (swash === undefined) continue;
    const front = frontOf(swash, time, along);
    if (front !== undefined && front > position) return swash;
  }
  return undefined;
};

export type Drift = Readonly<{
  /** 沖へ流された距離 */
  seaward: number;
  /** 波打ち際に沿って流された距離 */
  lateral: number;
  /** 回った角度（ラジアン） */
  spin: number;
  /** 海に消えたか */
  gone: boolean;
  /** 砂に埋もれている度合い（1 = すっかり埋もれている、0 = 砂の上にいる） */
  buried: number;
}>;

export const initialDrift: Drift = {
  seaward: 0,
  lateral: 0,
  spin: 0,
  gone: false,
  buried: 0,
};

/** 砂にすっかり埋もれたエビ。最初の位置にいて、波に洗われるたびに少しずつ現れる */
export const buriedDrift: Drift = { ...initialDrift, buried: 1 };

/**
 * `from` から `to` までの間に、波がエビを動かした結果を返す。
 * エビは、かぶっている水のうちいちばん新しい波の流れに乗る。
 * 寄せ波で少し陸へ押され、引き波でそれより多く沖へ引かれる。水をかぶっていない間は動かない。
 * 砂に埋もれているエビは動かず、引き波が上の砂をさらうたびに少しずつ現れる。現れきってから、波に運ばれる。
 */
export const carry = (
  drift: Drift,
  from: number,
  to: number,
  waves: Waves,
): Drift => {
  const elapsed = to - from;
  if (drift.gone || elapsed <= 0 || elapsed > MAX_GAP) return drift;

  const steps = Math.ceil(elapsed / STEP);
  let { seaward, lateral, spin, buried } = drift;
  let previous = from;
  for (let i = 1; i <= steps; i++) {
    const now = from + (elapsed * i) / steps;
    const position = EBB_LINE - seaward;
    const swash = newestOver(waves.visibleAt(now), now, lateral, position);
    const front = swash && frontOf(swash, now, lateral);
    const frontBefore = swash && frontOf(swash, previous, lateral);
    // 最初の波はエビを運んでくる波なので、攫わない
    if (
      swash !== undefined
      && swash.index > 0
      && front !== undefined
      && frontBefore !== undefined
    ) {
      const frontMove = front - frontBefore;
      const covered = clamp01((front - position) / COVER_DEPTH);
      if (buried > 0) {
        buried = Math.max(0, buried - Math.max(0, -frontMove) * UNEARTH_RATE * covered);
      } else {
        const move = -frontMove
          * (frontMove < 0 ? BACKWASH_PULL : UPRUSH_PUSH)
          * covered;
        seaward += move;
        spin += move * 1.1;
        lateral += move * 0.12 * Math.sin(swash.index * 2.4);
      }
    }
    previous = now;
  }
  return { seaward, lateral, spin, gone: seaward > GONE_AT, buried };
};

/**
 * スクロールで満ちた潮が `tideFrom` から `tideTo`（どちらも 0〜1）へ引く間に、エビを動かした結果を返す。
 * 潮をかぶっているエビは、引いていく水に沖へ運ばれる。浅くかぶっただけなら少しずれるだけで、
 * すっかり覆われていたら海へ消える。潮が満ちていく間と、潮の届いていないエビ、砂に埋もれているエビは動かない。
 * 時間によらず、潮の引いた量だけで決まる（画面の外にいる間や、一気に戻ったときも同じ結果になる）。
 */
export const ebb = (drift: Drift, tideFrom: number, tideTo: number): Drift => {
  const fall = (tideFrom - tideTo) * TIDE_REACH;
  if (drift.gone || drift.buried > 0 || !(fall > 0)) return drift;

  const steps = Math.ceil(fall / EBB_STEP);
  const stride = fall / steps;
  let { seaward, spin } = drift;
  for (let i = 0; i < steps; i++) {
    const waterline = tideFrom * TIDE_REACH - stride * i;
    const covered = clamp01((waterline - (EBB_LINE - seaward)) / COVER_DEPTH);
    const move = stride * EBB_PULL * covered;
    seaward += move;
    spin += move * 1.1;
  }
  if (seaward === drift.seaward) return drift;
  return { ...drift, seaward, spin, gone: seaward > GONE_AT };
};

/**
 * エビがどれだけ水をかぶっているか（0〜1）。`tide` はスクロールで満ちた潮（0〜1）。
 */
export const coverage = (
  drift: Drift,
  swashes: readonly Swash[],
  time: number,
  tide: number,
): number =>
  clamp01(
    (waterReach(swashes, time, drift.lateral)
      - (EBB_LINE - drift.seaward - tide * TIDE_REACH))
      / COVER_DEPTH,
  );

/**
 * 小さな波が、凪の波打ち際から浜をのぼる距離のめやす。
 * 小さな波はシェーダーだけが描くので、その分を水のあるところに含める
 */
const LAP_REACH = 0.08;

/**
 * 海の位置を決める正方形の中心から `right`・`down`（1 辺を 1 とした、画面の右向きと下向きの距離）の地点が、水の中か。
 * 海を押したかどうかを決めるのに使う。`tide` はスクロールで満ちた潮（0〜1）。
 * 沖は右上にある（shader.ts の SEAWARD と ALONG と同じ向き）。
 */
export const submerged = (
  right: number,
  down: number,
  swashes: readonly Swash[],
  time: number,
  tide: number,
): boolean => {
  const seaward = 0.8944 * right - 0.4472 * down;
  const along = 0.4472 * right + 0.8944 * down;
  return waterReach(swashes, time, along) + LAP_REACH
    >= EBB_LINE - seaward - tide * TIDE_REACH;
};

/**
 * エビの見え方（1 = はっきり見える、0 = 海に消えた）。砂に埋もれている度合いは含めない。
 */
export const visibility = (drift: Drift): number =>
  drift.gone ? 0 : 1 - clamp01((drift.seaward - FADE_FROM) / FADE_SPAN);

export type WaveUniforms = Readonly<{
  /** 波ごとに [岸に届いてからの秒数, 浜をのぼる距離, 寄せきるまでの秒数, 引ききるまでの秒数] */
  motion: Float32Array;
  /** 波ごとに [斜めに届く遅れ, うねりの位相 ×3] */
  shape: Float32Array;
}>;

/** とうに引ききった波。シェーダーの空いた枠を埋める */
const SPENT_MOTION = [
  1000,
  1,
  UPRUSH_SECONDS,
  UPRUSH_SECONDS * BACKWASH_RATIO,
] as const;

/**
 * 波をシェーダーへ渡す形に詰める。古い順に並べ、足りない分は先頭を引ききった波で埋める。
 * 時刻は `time` からの差で渡す。長く開いたままでも、シェーダーの中で桁が落ちない。
 */
export const packWaves = (
  swashes: readonly Swash[],
  time: number,
): WaveUniforms => {
  const motion = new Float32Array(WAVE_SLOTS * 4);
  const shape = new Float32Array(WAVE_SLOTS * 4);
  const latest = swashes.slice(-WAVE_SLOTS);
  const empty = WAVE_SLOTS - latest.length;
  for (let slot = 0; slot < WAVE_SLOTS; slot++) {
    const swash = latest[slot - empty];
    if (swash === undefined) {
      motion.set(SPENT_MOTION, slot * 4);
      continue;
    }
    motion.set(
      [time - swash.arrival, swash.reach, swash.uprush, swash.backwash],
      slot * 4,
    );
    shape.set([swash.skew, ...swash.phases], slot * 4);
  }
  return { motion, shape };
};
