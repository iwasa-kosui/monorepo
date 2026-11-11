/** 離すと更新されるインジケーターの高さ。 */
export const PULL_TO_REFRESH_THRESHOLD = 64;

/** インジケーターが伸びる上限。指をどれだけ動かしてもこれ以上にはならない。 */
export const PULL_MAX_DISTANCE = 128;

/**
 * 指の移動量に抵抗をかける。引けば引くほど重くなり、PULL_MAX_DISTANCE に漸近する。
 */
export const rubberBand = (raw: number): number =>
  raw <= 0 ? 0 : PULL_MAX_DISTANCE * (1 - Math.exp(-raw / PULL_MAX_DISTANCE));

export const isPullArmed = (distance: number): boolean => distance >= PULL_TO_REFRESH_THRESHOLD;

export const pullPhaseAfterRelease = (distance: number): 'idle' | 'refreshing' =>
  isPullArmed(distance) ? 'refreshing' : 'idle';

/** しきい値に対する引っ張り具合（0〜1）。 */
export const pullProgress = (distance: number): number =>
  Math.min(1, Math.max(0, distance / PULL_TO_REFRESH_THRESHOLD));

export const refreshResultLabel = (count: number | undefined): string =>
  count === undefined ? '更新しました' : count === 0 ? '新しい投稿はありません' : `${count}件の新しい投稿`;
