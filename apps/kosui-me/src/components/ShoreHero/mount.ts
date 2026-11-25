import { goneNote, PRESSED_NOTE, recordLoss } from './notes';
import { buildPatternTexture, PATTERN_SIZE } from './pattern';
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shader';
import { buildShadowTexture, buildSpriteTexture, GRID, SHADOW_SIZE } from './shrimp';
import { carry, coverage, createWaves, type Drift, initialDrift, packWaves, visibility } from './wave';

/** 動きを止めた 1 枚絵として見せるときの時刻（最初の波が引いて、エビが濡れた砂の上にいる） */
const STILL_TIME = 5.2;

/** 描画の解像度の上限（デバイスピクセル比） */
const MAX_PIXEL_RATIO = 1.5;

/** 1 コマにこれ以上かかる端末では、解像度を下げる（ミリ秒） */
const SLOW_FRAME = 24;

/** 本文のシートがヒーローに重なりきるまでに、名前と紹介が上へ退く距離（px）と、薄れる割合 */
const RECEDE_DISTANCE = 60;
const RECEDE_FADE = 0.75;

const UNIFORMS = [
  'uResolution',
  'uPixelRatio',
  'uTime',
  'uTide',
  'uWaveMotion',
  'uWaveShape',
  'uRect',
  'uOffset',
  'uRotation',
  'uCover',
  'uVisible',
  'uBlink',
  'uGain',
  'uGrain',
  'uSheen',
  'uFroth',
  'uWetTint',
  'uShadowTint',
  'uSand',
  'uSeaShallow',
  'uSeaDeep',
  'uFoam',
  'uLight',
  'uShell',
  'uEye',
  'uSprite',
  'uShadow',
  'uPattern',
] as const;

type UniformName = (typeof UNIFORMS)[number];
type Uniforms = Record<UniformName, WebGLUniformLocation | null>;
type Rgb = readonly [number, number, number];

type Palette = Readonly<{
  sand: Rgb;
  seaShallow: Rgb;
  seaDeep: Rgb;
  foam: Rgb;
  light: Rgb;
  shell: Rgb;
  eye: Rgb;
  wetTint: Rgb;
  shadowTint: Rgb;
  gain: number;
  grain: number;
  sheen: number;
  froth: number;
}>;

const parseHex = (value: string): Rgb => {
  const hex = value.trim().replace('#', '');
  const full = hex.length === 3
    ? hex.split('').map((c) => c + c).join('')
    : hex;
  const channel = (index: number): number => parseInt(full.slice(index, index + 2), 16) / 255;
  return [channel(0), channel(2), channel(4)];
};

/** 配色は CSS のカスタムプロパティから読む。ライトとダークの切り替えは CSS 側で行う */
const readPalette = (element: HTMLElement): Palette => {
  const style = getComputedStyle(element);
  const color = (name: string): Rgb => parseHex(style.getPropertyValue(name));
  const number = (name: string): number => parseFloat(style.getPropertyValue(name)) || 1;
  return {
    sand: color('--shore-sand'),
    seaShallow: color('--shore-sea-shallow'),
    seaDeep: color('--shore-sea-deep'),
    foam: color('--shore-foam'),
    light: color('--shore-light'),
    shell: color('--shore-shell'),
    eye: color('--shore-eye'),
    wetTint: color('--shore-wet-tint'),
    shadowTint: color('--shore-shadow-tint'),
    gain: number('--shore-gain'),
    grain: number('--shore-grain'),
    sheen: number('--shore-sheen'),
    froth: number('--shore-froth'),
  };
};

const compile = (
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | undefined => {
  const shader = gl.createShader(type);
  if (!shader) return undefined;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    return undefined;
  }
  return shader;
};

const createProgram = (
  gl: WebGLRenderingContext,
): WebGLProgram | undefined => {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return undefined;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    return undefined;
  }
  return program;
};

/** 模様は作るのに数十ミリ秒かかるので、ページを行き来しても 1 度だけ作る */
let pattern: Uint8Array | undefined;

const setUpTextures = (gl: WebGLRenderingContext): void => {
  const sample = (filter: number, wrap: number): void => {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  };
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    GRID,
    GRID,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    buildSpriteTexture(),
  );
  sample(gl.NEAREST, gl.CLAMP_TO_EDGE);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.LUMINANCE,
    SHADOW_SIZE,
    SHADOW_SIZE,
    0,
    gl.LUMINANCE,
    gl.UNSIGNED_BYTE,
    buildShadowTexture(),
  );
  sample(gl.LINEAR, gl.CLAMP_TO_EDGE);

  // 泡と砂のむらの模様。繰り返して並べる
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    PATTERN_SIZE,
    PATTERN_SIZE,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    pattern ??= buildPatternTexture(),
  );
  sample(gl.LINEAR, gl.REPEAT);
};

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
  /** エビの最初の位置と大きさを決める枠 */
  slot: HTMLElement;
  /** エビに重ねた、触れる・押すためのボタン */
  button: HTMLButtonElement;
  /** エビのそばに一言を出す場所 */
  note: HTMLElement;
  /** 名前と紹介、エビの枠をまとめた部分。本文のシートが重なる間、上へ退いて薄れる */
  content: HTMLElement;
}>;

/**
 * 海辺の描画を始める。戻り値の関数で止めて後片付けをする。
 * WebGL が使えない環境では何もせず、静止したドット絵（SVG）がそのまま見える。
 */
export const mountShore = (elements: ShoreElements): () => void => {
  const { hero, canvas, slot, button, note, content } = elements;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');

  const gl = canvas.getContext('webgl', {
    antialias: false,
    alpha: false,
    powerPreference: 'low-power',
  });
  const program = gl ? createProgram(gl) : undefined;
  if (!gl || !program) return () => {};

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const position = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const uniforms = Object.fromEntries(
    UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)]),
  ) as Uniforms;
  setUpTextures(gl);
  gl.uniform1i(uniforms.uSprite, 0);
  gl.uniform1i(uniforms.uShadow, 1);
  gl.uniform1i(uniforms.uPattern, 2);

  const waves = createWaves(Math.random);
  const startedAt = performance.now();
  let palette = readPalette(hero);
  let drift: Drift = initialDrift;
  let previousTime: number | undefined;
  let cover = 0;
  let tide = 0;
  let twitchAt = -Infinity;
  let hopAt = -Infinity;
  let quality = 1;
  let previousFrame: number | undefined;
  let slowTotal = 0;
  let slowCount = 0;
  let visible = true;
  let frame = 0;
  let disposed = false;
  let noteTimer: number | undefined;

  /** 一言を出す。`duration` を渡すと、その時間（ミリ秒）で消す */
  const showNote = (text: string, duration?: number): void => {
    window.clearTimeout(noteTimer);
    note.textContent = text;
    note.classList.add('is-shown');
    if (duration === undefined) return;
    noteTimer = window.setTimeout(
      () => note.classList.remove('is-shown'),
      duration,
    );
  };

  /** 描画が重い端末では、解像度を段階的に下げる */
  const adaptQuality = (now: number): void => {
    if (previousFrame !== undefined && now - previousFrame < 200) {
      slowTotal += now - previousFrame;
      slowCount += 1;
    }
    previousFrame = now;
    if (slowCount < 40) return;
    if (slowTotal / slowCount > SLOW_FRAME && quality > 0.5) quality *= 0.8;
    slowTotal = 0;
    slowCount = 0;
  };

  const draw = (now: number): void => {
    frame = 0;
    if (disposed) return;
    if (!reduceMotion) adaptQuality(now);

    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
      * quality;
    const width = Math.round(hero.clientWidth * pixelRatio);
    const height = Math.round(hero.clientHeight * pixelRatio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }

    const elapsed = (now - startedAt) / 1000;
    // data-shore-time を付けると、その時刻で止めた絵になる（見た目の確認用）
    const pinned = hero.dataset.shoreTime;
    const time = reduceMotion
      ? STILL_TIME
      : pinned === undefined
      ? elapsed
      : Number(pinned);
    if (!reduceMotion && previousTime !== undefined) {
      const wasGone = drift.gone;
      drift = carry(drift, previousTime, time, waves);
      if (drift.gone && !wasGone) {
        button.hidden = true;
        showNote(goneNote(recordLoss(window.localStorage)));
      }
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

    const [twitchX, twitchY, twitchTurn] = twitch((now - twitchAt) / 1000);
    const [hopX, hopY, hopTurn] = hop((now - hopAt) / 800);

    gl.uniform2f(uniforms.uResolution, width, height);
    gl.uniform1f(uniforms.uPixelRatio, pixelRatio);
    gl.uniform1f(uniforms.uTime, time);
    gl.uniform1f(uniforms.uTide, tide);
    const waveUniforms = packWaves(swashes, time);
    gl.uniform4fv(uniforms.uWaveMotion, waveUniforms.motion);
    gl.uniform4fv(uniforms.uWaveShape, waveUniforms.shape);
    gl.uniform3f(
      uniforms.uRect,
      slotRect.left - heroRect.left,
      slotRect.top - heroRect.top,
      slotRect.width,
    );
    gl.uniform2f(
      uniforms.uOffset,
      cellsX + twitchX + hopX,
      cellsY + twitchY + hopY,
    );
    gl.uniform1f(uniforms.uRotation, drift.spin + twitchTurn + hopTurn);
    gl.uniform1f(uniforms.uCover, cover);
    gl.uniform1f(uniforms.uVisible, visibility(drift));
    gl.uniform1f(
      uniforms.uBlink,
      !reduceMotion && elapsed % 5.5 > 5.36 ? 0 : 1,
    );
    gl.uniform1f(uniforms.uGain, palette.gain);
    gl.uniform1f(uniforms.uGrain, palette.grain);
    gl.uniform1f(uniforms.uSheen, palette.sheen);
    gl.uniform1f(uniforms.uFroth, palette.froth);
    gl.uniform3fv(uniforms.uWetTint, palette.wetTint);
    gl.uniform3fv(uniforms.uShadowTint, palette.shadowTint);
    gl.uniform3fv(uniforms.uSand, palette.sand);
    gl.uniform3fv(uniforms.uSeaShallow, palette.seaShallow);
    gl.uniform3fv(uniforms.uSeaDeep, palette.seaDeep);
    gl.uniform3fv(uniforms.uFoam, palette.foam);
    gl.uniform3fv(uniforms.uLight, palette.light);
    gl.uniform3fv(uniforms.uShell, palette.shell);
    gl.uniform3fv(uniforms.uEye, palette.eye);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (!reduceMotion && visible) frame = requestAnimationFrame(draw);
  };

  const requestDraw = (): void => {
    if (!disposed && frame === 0) frame = requestAnimationFrame(draw);
  };

  // スクロール: ページを読み進めるほど潮が満ち、浜とエビを覆う。
  // ヒーローが画面に留まる幅では、本文のシートが重なる間、名前と紹介が少し上へ退いて薄れる
  let scrollQueued = false;
  const applyScroll = (): void => {
    scrollQueued = false;
    tide = Math.min(1, Math.max(0, window.scrollY / (hero.offsetHeight || 1)));
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
    showNote(PRESSED_NOTE, 2600);
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
    content.style.transform = '';
    content.style.opacity = '';
    window.clearTimeout(noteTimer);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };

  hero.classList.add('is-live');
  observer.observe(hero);
  window.addEventListener('resize', requestDraw);
  colorScheme.addEventListener('change', onPaletteChange);
  canvas.addEventListener('webglcontextlost', onContextLost);
  if (!reduceMotion) {
    window.addEventListener('scroll', onScroll, { passive: true });
    // 画面の幅が変わると、ヒーローが画面に留まるかどうかも変わる
    window.addEventListener('resize', onScroll);
    button.addEventListener('pointerenter', onTouch);
    button.addEventListener('click', onPress);
    // 途中までスクロールした位置へ戻ってきたときも、はじめから潮と退き具合を合わせる
    applyScroll();
  }
  requestDraw();

  return dispose;
};
