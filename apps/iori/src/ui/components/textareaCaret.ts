// textarea と同じ見た目の div に文字を写して、キャレットの位置を測るときに揃えるスタイル
const MIRRORED_PROPERTIES = [
  'boxSizing',
  'width',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'textTransform',
  'textIndent',
  'tabSize',
  'wordSpacing',
] as const;

const lineHeightOf = (style: CSSStyleDeclaration): number => {
  const parsed = Number.parseFloat(style.lineHeight);
  return Number.isFinite(parsed) ? parsed : Number.parseFloat(style.fontSize) * 1.5;
};

/** キャレットのある行の上端と下端を、textarea の上端（枠の外側）からの距離で返す。スクロールも差し引く。 */
export const caretLineOffset = (
  textarea: HTMLTextAreaElement,
  caret: number,
): Readonly<{ top: number; bottom: number }> => {
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  for (const property of MIRRORED_PROPERTIES) {
    mirror.style[property] = style[property];
  }
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.borderStyle = 'solid';
  mirror.textContent = textarea.value.slice(0, caret);
  const marker = document.createElement('span');
  marker.textContent = '​';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const top = marker.offsetTop - textarea.scrollTop;
  document.body.removeChild(mirror);
  return { top, bottom: top + lineHeightOf(style) };
};
