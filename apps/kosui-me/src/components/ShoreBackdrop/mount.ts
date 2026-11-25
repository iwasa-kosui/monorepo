import { createQuality, createShoreRenderer, readPalette, type ShoreRenderer } from '../ShoreHero/renderer';
import { createWaves, packWaves } from '../ShoreHero/wave';
import { placeSea } from './placement';

/** 動きを止めた 1 枚絵として見せるときの時刻（最初の波が引いて、泡と濡れた跡が砂に残っている） */
const STILL_TIME = 5.2;

/** 描画の解像度の上限（デバイスピクセル比） */
const MAX_PIXEL_RATIO = 1.5;

export type BackdropElements = Readonly<{
  /** 背景の枠。配色のカスタムプロパティを持ち、canvas はこの大きさに合わせる */
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  /** 同じページで海を描いている帯。これが画面にある間、背景は隠れて描くのをやめる */
  hero?: HTMLElement;
}>;

/**
 * 記事の背景に、波打ち際を描き始める。戻り値の関数で止めて後片付けをする。
 * WebGL が使えない環境では何もせず、砂の地だけが見える。
 */
export const mountBackdrop = (elements: BackdropElements): () => void => {
  const { root, canvas, hero } = elements;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');

  // 描く段になってから用意する。狭い画面で帯の後ろに回り、1 度も描かないことがある
  let renderer: ShoreRenderer | undefined;

  const waves = createWaves(Math.random);
  const quality = createQuality();
  const startedAt = performance.now();
  let palette = readPalette(root);
  let onScreen = true;
  let heroOnScreen = hero !== undefined;
  let frame = 0;
  let disposed = false;

  const draw = (now: number): void => {
    frame = 0;
    if (disposed) return;
    const width = root.clientWidth;
    const height = root.clientHeight;
    if (width === 0 || height === 0 || heroOnScreen) return;
    renderer ??= createShoreRenderer(canvas);
    if (!renderer) {
      dispose();
      return;
    }
    root.classList.add('is-live');

    // data-shore-time を付けると、その時刻で止めた絵になる（見た目の確認用）
    const pinned = root.dataset.shoreTime;
    const time = reduceMotion
      ? STILL_TIME
      : pinned === undefined
      ? (now - startedAt) / 1000
      : Number(pinned);
    renderer.render({
      width,
      height,
      pixelRatio: Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
        * (reduceMotion ? 1 : quality.sample(now)),
      time,
      tide: 0,
      waves: packWaves(waves.visibleAt(time), time),
      rect: placeSea(width),
      palette,
    });

    if (!reduceMotion && onScreen) frame = requestAnimationFrame(draw);
  };

  const requestDraw = (): void => {
    if (!disposed && frame === 0) frame = requestAnimationFrame(draw);
  };

  const onPaletteChange = (): void => {
    palette = readPalette(root);
    requestDraw();
  };
  const onContextLost = (event: Event): void => {
    event.preventDefault();
    dispose();
  };
  // 狭い画面では、背景はページの上端にだけある。読み進めて画面から外れたら、描くのをやめる
  // 帯が画面にある間は隠れ、帯が画面から外れると現れる
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.target === hero) heroOnScreen = entry.isIntersecting;
      else onScreen = entry.isIntersecting;
    }
    if (heroOnScreen) root.classList.remove('is-live');
    else if (onScreen) requestDraw();
  });

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    if (frame !== 0) cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener('resize', requestDraw);
    colorScheme.removeEventListener('change', onPaletteChange);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    root.classList.remove('is-live');
    renderer?.dispose();
  };

  observer.observe(root);
  if (hero) observer.observe(hero);
  window.addEventListener('resize', requestDraw);
  colorScheme.addEventListener('change', onPaletteChange);
  canvas.addEventListener('webglcontextlost', onContextLost);
  requestDraw();

  return dispose;
};
