import { INITIAL_PALETTE, nextPalette, type ShorePaletteName } from './palette';

/**
 * いまの配色を覚えて、ページに反映する。
 * 配色は <html> の data-shore-palette に書き、global.css がそれを見て色を決める。
 * ページを行き来しても同じ配色のままで、ページを読み込み直すとはじめの配色に戻る。
 */

/** 配色を切り替えたとき、document へ送るイベント */
export const PALETTE_EVENT = 'shore:palette';

let current: ShorePaletteName = INITIAL_PALETTE;

const apply = (): void => {
  const root = document.documentElement;
  if (current === INITIAL_PALETTE) delete root.dataset.shorePalette;
  else root.dataset.shorePalette = current;
};

/** 次の配色へ切り替える */
export const cyclePalette = (): void => {
  current = nextPalette(current);
  apply();
  document.dispatchEvent(new Event(PALETTE_EVENT));
};

// ページを行き来すると、<html> の属性は新しいページのものに置き換わるので、付け直す
document.addEventListener('astro:after-swap', apply);
