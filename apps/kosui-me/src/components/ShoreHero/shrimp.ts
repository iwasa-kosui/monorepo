/**
 * ドット絵のエビ（20×20 マス）。favicon.svg と同じ絵。
 */

/** 1 辺のマス数 */
export const GRID = 20;

/** 殻のマス。[x, y, 幅] の横の連なりで持つ */
const SHELL_RUNS: readonly (readonly [number, number, number])[] = [
  [5, 3, 3],
  [4, 4, 1],
  [8, 4, 3],
  [4, 5, 1],
  [11, 5, 1],
  [4, 6, 1],
  [6, 6, 1],
  [12, 6, 1],
  [5, 7, 3],
  [13, 7, 1],
  [6, 8, 1],
  [8, 8, 1],
  [14, 8, 1],
  [6, 9, 4],
  [15, 9, 1],
  [7, 10, 4],
  [16, 10, 1],
  [4, 11, 2],
  [8, 11, 3],
  [16, 11, 1],
  [6, 12, 5],
  [16, 12, 1],
  [5, 13, 1],
  [7, 13, 4],
  [17, 13, 1],
  [1, 14, 2],
  [6, 14, 4],
  [17, 14, 1],
  [2, 15, 6],
  [17, 15, 1],
  [1, 16, 3],
];

/** 目のマス */
const EYE: readonly [number, number] = [7, 8];

const cellPath = (x: number, y: number, width: number): string => `M${x} ${y}h${width}v1h-${width}z`;

/** SVG で描くときの殻のパス（viewBox は 0 0 20 20） */
export const SHELL_PATH = SHELL_RUNS.map(([x, y, width]) => cellPath(x, y, width)).join('');

/** SVG で描くときの目のパス */
export const EYE_PATH = cellPath(EYE[0], EYE[1], 1);

/** 殻と目を合わせた、絵のあるマスの一覧 */
const filledCells = (): readonly (readonly [number, number])[] => [
  ...SHELL_RUNS.flatMap(([x, y, width]) =>
    Array.from({ length: width }, (_, i): readonly [number, number] => [
      x + i,
      y,
    ])
  ),
  EYE,
];

/**
 * シェーダーに渡す 20×20 の RGBA。a = 絵のあるマス、r = 目のマス。
 */
export const buildSpriteTexture = (): Uint8Array => {
  const data = new Uint8Array(GRID * GRID * 4);
  for (const [x, y] of filledCells()) {
    data[(y * GRID + x) * 4 + 3] = 255;
  }
  data[(EYE[1] * GRID + EYE[0]) * 4] = 255;
  return data;
};

/** 影のテクスチャで、絵の周りに取る余白（マス） */
export const SHADOW_MARGIN = 2;

/** 影のテクスチャで、1 マスに割り当てる画素数 */
const SHADOW_SCALE = 4;

/** 影のテクスチャの 1 辺の画素数 */
export const SHADOW_SIZE = (GRID + SHADOW_MARGIN * 2) * SHADOW_SCALE;

const BLUR_RADIUS = 3;
const BLUR_PASSES = 3;

/**
 * 砂に落ちる柔らかい影。エビの形をぼかした 1 チャンネルの画像を返す。
 */
export const buildShadowTexture = (): Uint8Array => {
  const size = SHADOW_SIZE;
  let source = new Float32Array(size * size);
  let target = new Float32Array(size * size);
  for (const [x, y] of filledCells()) {
    const left = (x + SHADOW_MARGIN) * SHADOW_SCALE;
    const top = (y + SHADOW_MARGIN) * SHADOW_SCALE;
    for (let dy = 0; dy < SHADOW_SCALE; dy++) {
      for (let dx = 0; dx < SHADOW_SCALE; dx++) {
        source[(top + dy) * size + left + dx] = 1;
      }
    }
  }
  const blur = (stepX: number, stepY: number): void => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = 0;
        for (let d = -BLUR_RADIUS; d <= BLUR_RADIUS; d++) {
          const sx = Math.min(size - 1, Math.max(0, x + d * stepX));
          const sy = Math.min(size - 1, Math.max(0, y + d * stepY));
          sum += source[sy * size + sx] ?? 0;
        }
        target[y * size + x] = sum / (BLUR_RADIUS * 2 + 1);
      }
    }
    [source, target] = [target, source];
  };
  for (let pass = 0; pass < BLUR_PASSES; pass++) {
    blur(1, 0);
    blur(0, 1);
  }
  return Uint8Array.from(source, (value) => Math.round(value * 255));
};
