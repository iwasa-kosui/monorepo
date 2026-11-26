import { createPaletteFade } from '../ShoreHero/palette';
import { PALETTE_EVENT } from '../ShoreHero/paletteSwitch';
import { createQuality, createShoreRenderer, readPalette } from '../ShoreHero/renderer';
import { watchSeaTaps } from '../ShoreHero/tap';
import { createWaves, packWaves, submerged } from '../ShoreHero/wave';
import { placeSea } from './placement';

/** 動きを止めた 1 枚絵として見せるときの時刻（最初の波が引いて、泡と濡れた跡が砂に残っている） */
const STILL_TIME = 5.2;

/** 描画の解像度の上限（デバイスピクセル比） */
const MAX_PIXEL_RATIO = 1.5;

export type BackdropElements = Readonly<{
  /** 背景の枠。配色のカスタムプロパティを持ち、canvas はこの大きさに合わせる */
  root: HTMLElement;
  canvas: HTMLCanvasElement;
}>;

/**
 * 記事の背景に、波打ち際を描き始める。戻り値の関数で止めて後片付けをする。
 * 海を押すと、海と浜の配色がでたらめに切り替わる。
 * WebGL が使えない環境では何もせず、砂の地だけが見える。
 */
export const mountBackdrop = (elements: BackdropElements): () => void => {
  const { root, canvas } = elements;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');

  const renderer = createShoreRenderer(canvas);
  if (!renderer) return () => {};

  const waves = createWaves(Math.random);
  const quality = createQuality();
  const startedAt = performance.now();
  const palette = createPaletteFade(readPalette(root));
  let shownTime: number | undefined;
  let visible = true;
  let frame = 0;
  let disposed = false;

  const draw = (now: number): void => {
    frame = 0;
    if (disposed) return;
    const width = root.clientWidth;
    const height = root.clientHeight;
    if (width === 0 || height === 0) return;

    // data-shore-time を付けると、その時刻で止めた絵になる（見た目の確認用）
    const pinned = root.dataset.shoreTime;
    const time = reduceMotion
      ? STILL_TIME
      : pinned === undefined
      ? (now - startedAt) / 1000
      : Number(pinned);
    shownTime = time;
    renderer.render({
      width,
      height,
      pixelRatio: Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
        * (reduceMotion ? 1 : quality.sample(now)),
      time,
      tide: 0,
      waves: packWaves(waves.visibleAt(time), time),
      rect: placeSea(width),
      palette: palette.at(now),
    });

    if (!reduceMotion && visible) frame = requestAnimationFrame(draw);
  };

  const requestDraw = (): void => {
    if (!disposed && frame === 0) frame = requestAnimationFrame(draw);
  };

  const onPaletteChange = (): void => {
    palette.change(readPalette(root), performance.now(), reduceMotion);
    requestDraw();
  };
  // 押したところが水の中か。最後に描いたコマの波で決める
  const stopWatchingTaps = watchSeaTaps(root, (clientX, clientY) => {
    if (shownTime === undefined) return false;
    const rootRect = root.getBoundingClientRect();
    const [left, top, unit] = placeSea(rootRect.width);
    return submerged(
      (clientX - rootRect.left - left) / unit - 0.5,
      (clientY - rootRect.top - top) / unit - 0.5,
      waves.visibleAt(shownTime),
      shownTime,
      0,
    );
  });
  const onContextLost = (event: Event): void => {
    event.preventDefault();
    dispose();
  };
  // 狭い画面では、背景はページの上端にだけある。読み進めて画面から外れたら、描くのをやめる
  const observer = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    if (visible) requestDraw();
  });

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    if (frame !== 0) cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener('resize', requestDraw);
    colorScheme.removeEventListener('change', onPaletteChange);
    document.removeEventListener(PALETTE_EVENT, onPaletteChange);
    stopWatchingTaps();
    canvas.removeEventListener('webglcontextlost', onContextLost);
    root.classList.remove('is-live');
    renderer.dispose();
  };

  root.classList.add('is-live');
  observer.observe(root);
  window.addEventListener('resize', requestDraw);
  colorScheme.addEventListener('change', onPaletteChange);
  document.addEventListener(PALETTE_EVENT, onPaletteChange);
  canvas.addEventListener('webglcontextlost', onContextLost);
  requestDraw();

  return dispose;
};
