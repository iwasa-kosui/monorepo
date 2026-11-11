import type { ReadingAnchor } from './homeSnapshot.ts';

/** この位置より上にいるときは「先頭で読んでいる」とみなし、位置を固定せず新着をそのまま見せる。 */
export const AT_TOP_THRESHOLD_PX = 4;

export type ItemRect = Readonly<{ key: string; top: number; bottom: number }>;

/**
 * 画面上端（topInset 分のヘッダーを除く）に見えている最初のアイテムを読み位置とする。
 */
export const anchorFromRects = (
  rects: readonly ItemRect[],
  scrollY: number,
  topInset: number = 0,
): ReadingAnchor | undefined => {
  if (scrollY <= AT_TOP_THRESHOLD_PX) return undefined;
  const visible = rects.find((rect) => rect.bottom > topInset);
  return visible === undefined ? undefined : { key: visible.key, offset: visible.top };
};

/** 読み位置のアイテムを元の画面位置に戻すために必要なスクロール量。 */
export const scrollCorrection = (anchor: ReadingAnchor, currentTop: number): number => {
  const delta = currentTop - anchor.offset;
  return Math.abs(delta) < 1 ? 0 : delta;
};

/**
 * 先頭に差し込まれたアイテムのキーを求める。
 * 以前の先頭アイテムが新しいリストのどこにあるかで判断し、見つからないとき（置き換え）は何も返さない。
 */
export const prependedKeys = (previous: readonly string[], next: readonly string[]): readonly string[] => {
  const previousFirst = previous[0];
  if (previousFirst === undefined) return [];
  const index = next.indexOf(previousFirst);
  if (index <= 0) return [];
  const known = new Set(previous);
  return next.slice(0, index).filter((key) => !known.has(key));
};
