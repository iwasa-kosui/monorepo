import { createQuality, createShoreRenderer, readPalette } from './renderer';
import { GRID } from './shrimp';
import {
  buriedDrift,
  carry,
  coverage,
  createWaves,
  type Drift,
  ebb,
  initialDrift,
  packWaves,
  visibility,
} from './wave';

/** 動きを止めた 1 枚絵として見せるときの時刻（最初の波が引いて、エビが濡れた砂の上にいる） */
const STILL_TIME = 5.2;

/** エビが海に消えてから、次のエビが砂の下に用意されるまでの秒数 */
const BURIED_AFTER = 12;

/** 埋もれている度合いがこれを下回ったら、エビを押せるようにする */
const PRESSABLE_BELOW = 0.4;

/** 描画の解像度の上限（デバイスピクセル比） */
const MAX_PIXEL_RATIO = 1.5;

/** 本文のシートがヒーローに重なりきるまでに、名前と紹介が上へ退く距離（px）と、薄れる割合 */
const RECEDE_DISTANCE = 60;
const RECEDE_FADE = 0.75;

/** 触れたときの弱い跳ね。経過秒から [沖へ, 上へ, 回転] を返す */
const twitch = (elapsed: number): readonly [number, number, number] => {
  if (elapsed < 0 || elapsed >= 1.6) return [0, 0, 0];
  const snap = elapsed < 0.16 ? elapsed / 0.16 : Math.exp(-(elapsed - 0.16) * 4.2);
  const lift = Math.sin(Math.min(1, elapsed / 0.45) * Math.PI)
    * Math.exp(-elapsed * 1.5);
  const turn = elapsed < 0.16 ? elapsed / 0.16 : Math.exp(-(elapsed - 0.16) * 6);
  return [1.1 * snap, -0.7 * lift, -0.2 * turn];
};

/** 押したときの少し強い跳ね */
const hop = (progress: number): readonly [number, number, number] => {
  if (progress < 0 || progress >= 1) return [0, 0, 0];
  const arc = Math.sin(Math.PI * progress);
  return [
    1.4 * Math.sin(Math.PI * progress * 0.5) * (1 - progress),
    -2.2 * arc,
    -0.5 * arc * (1 - progress),
  ];
};

export type ShoreElements = Readonly<{
  /** ヒーロー全体。配色のカスタムプロパティを持ち、canvas はこの大きさに合わせる */
  hero: HTMLElement;
  canvas: HTMLCanvasElement;
  /** エビの最初の位置と、波の大きさを決める枠 */
  slot: HTMLElement;
  /** エビに重ねた、触れる・押すためのボタン。枠より小さくすると、エビもその大きさになる */
  button: HTMLButtonElement;
  /**
   * 名前と紹介、エビの枠をまとめた部分。本文のシートが重なる間、上へ退いて薄れる。
   * 省くと、スクロールに応じた動き（潮が満ちる、上へ退く）をしない。画面に留まり続ける海で使う
   */
  content?: HTMLElement;
}>;

/**
 * 海辺の描画を始める。戻り値の関数で止めて後片付けをする。
 * WebGL が使えない環境では何もせず、静止したドット絵（SVG）がそのまま見える。
 */
export const mountShore = (elements: ShoreElements): () => void => {
  const { hero, canvas, slot, button, content } = elements;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');

  const renderer = createShoreRenderer(canvas);
  if (!renderer) return () => {};

  const waves = createWaves(Math.random);
  const startedAt = performance.now();
  let palette = readPalette(hero);
  let drift: Drift = initialDrift;
  let previousTime: number | undefined;
  let goneAt: number | undefined;
  let cover = 0;
  let tide = 0;
  let twitchAt = -Infinity;
  let hopAt = -Infinity;
  const quality = createQuality();
  let visible = true;
  let frame = 0;
  let disposed = false;

  const draw = (now: number): void => {
    frame = 0;
    if (disposed) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
      * (reduceMotion ? 1 : quality.sample(now));

    const elapsed = (now - startedAt) / 1000;
    // data-shore-time を付けると、その時刻で止めた絵になる（見た目の確認用）
    const pinned = hero.dataset.shoreTime;
    const time = reduceMotion
      ? STILL_TIME
      : pinned === undefined
      ? elapsed
      : Number(pinned);
    if (!reduceMotion && previousTime !== undefined) {
      drift = carry(drift, previousTime, time, waves);
      // 海に消えてしばらくすると、砂に埋もれていたエビを、波が少しずつ掘り出す
      if (drift.gone) {
        goneAt ??= time;
        if (time - goneAt > BURIED_AFTER) {
          drift = buriedDrift;
          goneAt = undefined;
        }
      }
      button.hidden = drift.gone || drift.buried > PRESSABLE_BELOW;
    }
    previousTime = time;
    const swashes = waves.visibleAt(time);
    cover += (coverage(drift, swashes, time, tide) - cover) * 0.12;

    // 枠は動かさず、ボタンだけをエビの今の位置へ動かす
    const heroRect = hero.getBoundingClientRect();
    const slotRect = slot.getBoundingClientRect();
    const cellsX = (0.8944 * drift.seaward + 0.4472 * drift.lateral) * GRID;
    const cellsY = (-0.4472 * drift.seaward + 0.8944 * drift.lateral) * GRID;
    const cell = slotRect.width / GRID;
    button.style.transform = `translate(${(cellsX * cell).toFixed(1)}px, ${(cellsY * cell).toFixed(1)}px)`;

    // 跳ねる高さは、エビの大きさに合わせる
    const scale = button.offsetWidth / (slot.offsetWidth || 1) || 1;
    const [twitchX, twitchY, twitchTurn] = twitch((now - twitchAt) / 1000);
    const [hopX, hopY, hopTurn] = hop((now - hopAt) / 800);

    renderer.render({
      width: hero.clientWidth,
      height: hero.clientHeight,
      pixelRatio,
      time,
      tide,
      waves: packWaves(swashes, time),
      rect: [
        slotRect.left - heroRect.left,
        slotRect.top - heroRect.top,
        slotRect.width,
      ],
      shrimp: {
        offset: [
          cellsX + (twitchX + hopX) * scale,
          cellsY + (twitchY + hopY) * scale,
        ],
        scale,
        rotation: drift.spin + twitchTurn + hopTurn,
        cover: cover * (1 - drift.buried), // 埋もれている間は、水に揺られない
        visible: visibility(drift),
        buried: drift.buried,
        blinking: !reduceMotion && elapsed % 5.5 > 5.36,
      },
      palette,
    });

    if (!reduceMotion && visible) frame = requestAnimationFrame(draw);
  };

  const requestDraw = (): void => {
    if (!disposed && frame === 0) frame = requestAnimationFrame(draw);
  };

  // スクロール: ページを読み進めるほど潮が満ち、浜とエビを覆う。
  // 上へ戻ると潮が引き、覆われていたエビを沖へ連れていく。戻りきる頃には、エビは浜にいない。
  // ヒーローが画面に留まる幅では、本文のシートが重なる間、名前と紹介が少し上へ退いて薄れる
  let scrollQueued = false;
  const applyScroll = (): void => {
    scrollQueued = false;
    if (!content) return;
    const nextTide = Math.min(1, Math.max(0, window.scrollY / (hero.offsetHeight || 1)));
    drift = ebb(drift, tide, nextTide);
    if (drift.gone) button.hidden = true;
    tide = nextTide;
    const pinned = getComputedStyle(hero).position === 'sticky';
    content.style.transform = pinned
      ? `translate3d(0, ${(-tide * RECEDE_DISTANCE).toFixed(1)}px, 0)`
      : '';
    content.style.opacity = pinned ? (1 - tide * RECEDE_FADE).toFixed(3) : '';
  };
  const onScroll = (): void => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(applyScroll);
  };

  const onPaletteChange = (): void => {
    palette = readPalette(hero);
    requestDraw();
  };
  const onTouch = (): void => {
    const now = performance.now();
    if (now - twitchAt > 1200 && now - hopAt > 800) twitchAt = now;
  };
  const onPress = (): void => {
    hopAt = performance.now();
    requestDraw();
  };
  const onContextLost = (event: Event): void => {
    event.preventDefault();
    dispose();
  };
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
    window.removeEventListener('resize', onScroll);
    window.removeEventListener('scroll', onScroll);
    colorScheme.removeEventListener('change', onPaletteChange);
    button.removeEventListener('pointerenter', onTouch);
    button.removeEventListener('click', onPress);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    hero.classList.remove('is-live');
    if (content) {
      content.style.transform = '';
      content.style.opacity = '';
    }
    renderer.dispose();
  };

  hero.classList.add('is-live');
  observer.observe(hero);
  window.addEventListener('resize', requestDraw);
  colorScheme.addEventListener('change', onPaletteChange);
  canvas.addEventListener('webglcontextlost', onContextLost);
  if (!reduceMotion) {
    button.addEventListener('pointerenter', onTouch);
    button.addEventListener('click', onPress);
  }
  if (!reduceMotion && content) {
    window.addEventListener('scroll', onScroll, { passive: true });
    // 画面の幅が変わると、ヒーローが画面に留まるかどうかも変わる
    window.addEventListener('resize', onScroll);
    // 途中までスクロールした位置へ戻ってきたときも、はじめから潮と退き具合を合わせる
    applyScroll();
  }
  requestDraw();

  return dispose;
};
