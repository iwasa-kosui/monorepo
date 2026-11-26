import { shufflePalette } from './paletteSwitch';

/**
 * 海を押したら、海と浜の配色をでたらめに切り替える。トップページのヒーロー、記事のタイトルの帯、記事の背景で共有する。
 */

/** 押したときに、それぞれの働きをするもの。海の上にあっても、配色は切り替えない */
const INTERACTIVE = 'a, button, input, select, textarea, summary, label, [role="button"]';

/** 背景のないものか。背景のないものは、後ろの海が透けて見える */
const isClear = (element: Element): boolean => {
  const style = getComputedStyle(element);
  const color = style.backgroundColor;
  return style.backgroundImage === 'none'
    && (color === 'transparent' || /[,/]\s*0(?:\.0+)?%?\s*\)$/.test(color));
};

/**
 * `root` に描いた海を押したら、配色を切り替える。戻り値の関数で、見張るのをやめる。
 * `isWater` は、画面上の位置（clientX, clientY）が水の中かを返す。
 *
 * 海は本文の後ろに敷いてあり、手前にはヘッダーやタイトルが重なるので、ページ全体のクリックを見る。
 * 紙や本文のシートのような背景のあるものが重なって、海が見えていないところでは切り替えない。
 */
export const watchSeaTaps = (
  root: HTMLElement,
  isWater: (clientX: number, clientY: number) => boolean,
): () => void => {
  const onClick = (event: MouseEvent): void => {
    const { target, clientX: x, clientY: y } = event;
    if (event.defaultPrevented || event.button !== 0) return;
    if (!(target instanceof Element) || target.closest(INTERACTIVE)) return;
    // 文字を選んだだけのときは、切り替えない
    if (window.getSelection()?.isCollapsed === false) return;
    const rect = root.getBoundingClientRect();
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) return;
    if (!isWater(x, y)) return;
    const covered = document.elementsFromPoint(x, y).some((element) =>
      element !== root
      && !root.contains(element)
      && !element.contains(root)
      && !isClear(element)
    );
    if (covered) return;
    shufflePalette();
  };
  document.addEventListener('click', onClick);
  return () => document.removeEventListener('click', onClick);
};
