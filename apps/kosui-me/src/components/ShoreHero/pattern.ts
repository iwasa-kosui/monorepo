/**
 * 泡と砂のむらに使う模様。シェーダーが 1 枚のテクスチャとして読む。
 * 上下左右がつながるので、繰り返して並べても継ぎ目が出ない。
 */

/** 1 辺の画素数 */
export const PATTERN_SIZE = 256;

/** 模様を決める乱数の種。変えると泡の形が変わる */
const SEED = 20261125;

/** 泡の穴を置く格子の、1 辺のマス数（大きい穴・小さい穴） */
const LARGE_HOLES = 16;
const SMALL_HOLES = 28;

/** 穴までの距離のうち、0〜255 に収める範囲（格子の 1 マスを 1 として） */
const HOLE_RANGE = 1.2;

/** むらに重ねる格子の枚数と、いちばん粗い格子の 1 辺のマス数 */
const MOTTLE_LAYERS = 5;
const MOTTLE_BASE = 4;

type Random = () => number;

/** 再現できる乱数。同じ種からは、どの環境でも同じ列になる */
const createRandom = (seed: number): Random => {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return (state >>> 8) / 16777216;
  };
};

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

/**
 * 格子の 1 マスに 1 つずつ、泡の穴を置く。マスの順に [マス内の x, マス内の y, 大きさ] を並べて返す。
 */
const scatterHoles = (cells: number, random: Random): Float32Array =>
  Float32Array.from({ length: cells * cells * 3 }, random);

/**
 * (u, v) から、いちばん近い穴の中心までの距離。穴の大きさで割るので、大きい穴ほど近くなる。
 * シェーダーは、この距離が半径より大きいところを泡として描く。半径を広げると、穴がつながって泡が筋になる。
 */
const holeDistance = (
  holes: Float32Array,
  cells: number,
  u: number,
  v: number,
): number => {
  const x = u * cells;
  const y = v * cells;
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  let nearest = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = cellX + dx;
      const cy = cellY + dy;
      const offset = (wrap(cy, cells) * cells + wrap(cx, cells)) * 3;
      const toX = cx + holes[offset] - x;
      const toY = cy + holes[offset + 1] - y;
      const size = 0.6 + 0.8 * holes[offset + 2];
      nearest = Math.min(nearest, (toX * toX + toY * toY) / (size * size));
    }
  }
  return Math.sqrt(nearest) / HOLE_RANGE;
};

/** 格子点ごとの乱数（0〜1） */
const lattice = (cells: number, seed: number): Float64Array => {
  const values = new Float64Array(cells * cells);
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const mixed = (Math.imul(i, 374761393)
        + Math.imul(j, 668265263)
        + Math.imul(seed, 974634721)) | 0;
      const hashed = Math.imul(mixed ^ (mixed >>> 13), 1274126177);
      values[j * cells + i] = ((hashed ^ (hashed >>> 16)) >>> 0) / 4294967296;
    }
  }
  return values;
};

const smooth = (value: number): number => value * value * (3 - 2 * value);

/**
 * なめらかなむら（0〜1）を返す関数を作る。細かさのちがう格子を重ねる。
 */
const createMottle = (seed: number): (u: number, v: number) => number => {
  const layers = Array.from({ length: MOTTLE_LAYERS }, (_, layer) => {
    const cells = MOTTLE_BASE * 2 ** layer;
    return { cells, values: lattice(cells, seed + layer) };
  });
  const total = 1 - 0.5 ** MOTTLE_LAYERS;
  return (u, v) => {
    let sum = 0;
    let weight = 0.5;
    for (let layer = 0; layer < MOTTLE_LAYERS; layer++) {
      const cells = layers[layer].cells;
      const values = layers[layer].values;
      const x = u * cells;
      const y = v * cells;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const row0 = y0 * cells;
      const row1 = ((y0 + 1) % cells) * cells;
      const x1 = (x0 + 1) % cells;
      const fx = smooth(x - x0);
      const fy = smooth(y - y0);
      sum += weight
        * ((values[row0 + x0] * (1 - fx) + values[row0 + x1] * fx) * (1 - fy)
          + (values[row1 + x0] * (1 - fx) + values[row1 + x1] * fx) * fy);
      weight *= 0.5;
    }
    return sum / total;
  };
};

/**
 * シェーダーに渡す 256×256 の RGBA。
 * r, g = いちばん近い泡の穴の中心までの距離（大きい穴・小さい穴）、b, a = むら（2 種類）。
 */
export const buildPatternTexture = (): Uint8Array => {
  const random = createRandom(SEED);
  const largeHoles = scatterHoles(LARGE_HOLES, random);
  const smallHoles = scatterHoles(SMALL_HOLES, random);
  const mottleB = createMottle(1);
  const mottleA = createMottle(9);
  const data = new Uint8Array(PATTERN_SIZE * PATTERN_SIZE * 4);
  for (let py = 0; py < PATTERN_SIZE; py++) {
    for (let px = 0; px < PATTERN_SIZE; px++) {
      const u = (px + 0.5) / PATTERN_SIZE;
      const v = (py + 0.5) / PATTERN_SIZE;
      const offset = (py * PATTERN_SIZE + px) * 4;
      data[offset] = Math.min(
        255,
        holeDistance(largeHoles, LARGE_HOLES, u, v) * 255,
      );
      data[offset + 1] = Math.min(
        255,
        holeDistance(smallHoles, SMALL_HOLES, u, v) * 255,
      );
      data[offset + 2] = mottleB(u, v) * 255;
      data[offset + 3] = mottleA(u, v) * 255;
    }
  }
  return data;
};
