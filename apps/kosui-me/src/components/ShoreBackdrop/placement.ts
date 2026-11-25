import { EBB_LINE } from '../ShoreHero/wave';

/**
 * 記事の背景の、海の置き方。
 * 海は枠の右上の隅にあり、波はそこから左下へ寄せる。
 */

/** 距離の単位（シェーダーの正方形の 1 辺）の、枠の幅に対する割合と、下限・上限（px） */
const UNIT_RATIO = 0.4;
const MIN_UNIT = 120;
const MAX_UNIT = 240;

/** 枠の上端で、凪の波打ち際から枠の右端までの距離（単位） */
const SEA_WIDTH = 0.35;

/** 海の方向（右上）の、右向きの成分。shader.ts の SEAWARD と同じ */
const SEAWARD_X = 0.8944;

/** 海の位置と縮尺を決める正方形。[左, 上, 1 辺の長さ]（枠の左上からの CSS px） */
export type SeaRect = readonly [number, number, number];

/**
 * 幅 `width`（CSS px）の枠に、海を置く。
 * 凪の波打ち際は、枠の上端を右端より少し内側で通り、下へ行くほど右へ逃げる。
 * 大きな波は、単位のおよそ 1.5 倍まで左へ届く。
 */
export const placeSea = (width: number): SeaRect => {
  const unit = Math.min(MAX_UNIT, Math.max(MIN_UNIT, width * UNIT_RATIO));
  const waterline = width - SEA_WIDTH * unit;
  // 正方形の中心を枠の上端に置く。波打ち際は、中心から海の方向へ EBB_LINE だけ離れている
  const centerX = waterline - (EBB_LINE * unit) / SEAWARD_X;
  return [centerX - unit / 2, -unit / 2, unit];
};
