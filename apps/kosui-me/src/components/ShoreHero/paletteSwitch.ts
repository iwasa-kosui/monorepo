import { INITIAL_SEA_HUE, randomTone, type ShoreTone, toneColors } from './tone';

/**
 * いまの配色を覚えて、ページに反映する。
 * 色は <html> のカスタムプロパティに書き、global.css の値を上書きする。
 * ページを行き来しても同じ配色のままで、ページを読み込み直すとはじめの配色（珊瑚色の海）に戻る。
 */

/** 配色が変わったとき、document へ送るイベント */
export const PALETTE_EVENT = 'shore:palette';

const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');

/** でたらめに決めた配色のもと。まだ海を押していなければ undefined */
let tone: ShoreTone | undefined;

const apply = (): void => {
  if (tone === undefined) return;
  const colors = toneColors(tone, colorScheme.matches);
  const { style } = document.documentElement;
  // 浜の色は、サイト全体の地の色
  style.setProperty('--color-bg', colors.sand);
  style.setProperty('--shore-sea-shallow', colors.seaShallow);
  style.setProperty('--shore-sea-deep', colors.seaDeep);
  style.setProperty('--shore-foam', colors.foam);
  style.setProperty('--shore-light', colors.light);
  style.setProperty('--shore-wet-tint', colors.wetTint);
};

/** 海の色も浜の色も、でたらめな配色へ切り替える */
export const shufflePalette = (): void => {
  tone = randomTone(Math.random, tone?.seaHue ?? INITIAL_SEA_HUE);
  apply();
  document.dispatchEvent(new Event(PALETTE_EVENT));
};

// ページを行き来すると、<html> の属性は新しいページのものに置き換わるので、書き直す
document.addEventListener('astro:after-swap', apply);

// 昼と夜が入れ替わったら、同じもとから、その時間の色を作り直す
colorScheme.addEventListener('change', () => {
  if (tone === undefined) return;
  apply();
  document.dispatchEvent(new Event(PALETTE_EVENT));
});
