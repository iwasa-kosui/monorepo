/**
 * 波の寄せ引きと、エビが波に攫われていく動きの計算。
 *
 * 距離の単位はエビのドット絵 1 辺（20 マス）を 1 とする。
 * 波打ち際の位置 `line` は、エビの最初の位置を 0 とし、沖へ向かって正。
 * シェーダー（shader.ts）の swash / shore と同じ式を使う。変えるときは両方を直す。
 */

/** 波 1 回の周期（秒） */
export const WAVE_PERIOD = 10;

/** 読み込み直後に波が寄せきった状態から始めるための、時刻のずらし（秒） */
const START_OFFSET = 3;

/** 波が引ききったときの波打ち際の位置 */
const EBB_LINE = 0.66;

/** 強さ 1 の波が寄せきったとき、波打ち際が陸側へ動く距離 */
const REACH = 1.36;

/** 最初の波だけ大きくして、エビを浜に置いていく */
const FIRST_AMPLITUDE = 1.2;

/** 寄せきるまでに使う、周期のうちの割合 */
const ADVANCE_RATIO = 0.36;

/** 引き波がエビを沖へ引く割合 */
const BACKWASH_PULL = 0.27;

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

/** 1 回の積分の刻み（秒） */
const STEP = 1 / 30;

/** これより長く止まっていた場合（タブを離れていた等）は、その間の動きを捨てる */
const MAX_GAP = 4;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * 周期内の位置（0〜1）から、波がどれだけ寄せているか（0〜1）を返す。
 * 速く寄せて、ゆっくり引く。
 */
export const swashProfile = (phase: number): number =>
  phase < ADVANCE_RATIO
    ? 1 - (1 - phase / ADVANCE_RATIO) ** 2.4
    : (1 - (phase - ADVANCE_RATIO) / (1 - ADVANCE_RATIO)) ** 1.7;

export type Wave = Readonly<{
  /** 何回目の波か（0 始まり） */
  cycle: number;
  /** この波の強さ */
  amplitude: number;
  /** 1 つ前の波の強さ */
  previousAmplitude: number;
  /** 波打ち際の位置 */
  line: number;
}>;

export type Waves = Readonly<{
  at: (time: number) => Wave;
}>;

/**
 * 波の列を作る。波ごとの強さは `random` で決め、一度決めた強さは変えない。
 */
export const createWaves = (random: () => number): Waves => {
  const amplitudes: number[] = [FIRST_AMPLITUDE];
  const amplitudeOf = (cycle: number): number => {
    while (amplitudes.length <= cycle) {
      amplitudes.push(0.68 + 0.32 * random());
    }
    return amplitudes[cycle] ?? FIRST_AMPLITUDE;
  };
  return {
    at: (time) => {
      const shifted = Math.max(0, time + START_OFFSET);
      const cycle = Math.floor(shifted / WAVE_PERIOD);
      const phase = shifted / WAVE_PERIOD - cycle;
      const amplitude = amplitudeOf(cycle);
      return {
        cycle,
        amplitude,
        previousAmplitude: amplitudeOf(Math.max(0, cycle - 1)),
        line: EBB_LINE - REACH * swashProfile(phase) * amplitude,
      };
    },
  };
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
}>;

export const initialDrift: Drift = {
  seaward: 0,
  lateral: 0,
  spin: 0,
  gone: false,
};

/**
 * `from` から `to` までの間に、波がエビを動かした結果を返す。
 * 寄せ波で少し陸へ押し、引き波でそれより多く沖へ引く。水をかぶっていない間は動かない。
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
  let { seaward, lateral, spin } = drift;
  let previousLine = waves.at(from).line;
  for (let i = 1; i <= steps; i++) {
    const wave = waves.at(from + (elapsed * i) / steps);
    // 最初の波はエビを運んでくる波なので、攫わない
    if (wave.cycle >= 1) {
      const lineMove = wave.line - previousLine;
      const covered = clamp01((seaward - wave.line) / COVER_DEPTH);
      const move = lineMove * (lineMove > 0 ? BACKWASH_PULL : UPRUSH_PUSH)
        * covered;
      seaward += move;
      spin += move * 1.1;
      lateral += move * 0.12 * Math.sin(wave.cycle * 2.4);
    }
    previousLine = wave.line;
  }
  return { seaward, lateral, spin, gone: seaward > GONE_AT };
};

/**
 * エビがどれだけ水をかぶっているか（0〜1）。`tide` はスクロールで満ちた潮（0〜1）。
 */
export const coverage = (drift: Drift, wave: Wave, tide: number): number =>
  clamp01((drift.seaward - (wave.line - tide * TIDE_REACH)) / COVER_DEPTH);

/**
 * エビの見え方（1 = はっきり見える、0 = 海に消えた）。
 */
export const visibility = (drift: Drift): number =>
  drift.gone ? 0 : 1 - clamp01((drift.seaward - FADE_FROM) / FADE_SPAN);
