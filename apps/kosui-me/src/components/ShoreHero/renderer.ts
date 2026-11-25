import { buildPatternTexture, PATTERN_SIZE } from './pattern';
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shader';
import { buildShadowTexture, buildSpriteTexture, GRID, SHADOW_SIZE } from './shrimp';
import type { WaveUniforms } from './wave';

/**
 * 海辺のシェーダーを canvas に描く部分。トップページのヒーローと、記事の背景で共有する。
 */

/** 1 コマにこれ以上かかる端末では、解像度を下げる（ミリ秒） */
const SLOW_FRAME = 24;

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
  'uBuried',
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

export type Palette = Readonly<{
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

/**
 * 配色は CSS のカスタムプロパティから読む（global.css の .shore-palette）。
 * ライトとダークの切り替えは CSS 側で行う
 */
export const readPalette = (element: HTMLElement): Palette => {
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

/** エビの描き方 */
export type ShrimpPose = Readonly<{
  /** 移動量（マス） */
  offset: readonly [number, number];
  /** 回転（ラジアン） */
  rotation: number;
  /** 水をかぶっている度合い（0〜1） */
  cover: number;
  /** 見え方（0〜1） */
  visible: number;
  /** 砂に埋もれている度合い（0〜1） */
  buried: number;
  /** 目を閉じているか */
  blinking: boolean;
}>;

/** 1 コマの絵 */
export type ShoreScene = Readonly<{
  /** 描く大きさ（CSS px） */
  width: number;
  height: number;
  /** 1 CSS px あたりの、描画先の画素数 */
  pixelRatio: number;
  /** 秒 */
  time: number;
  /** 満ちた潮（0〜1） */
  tide: number;
  waves: WaveUniforms;
  /**
   * 海の位置と縮尺を決める正方形の、左上（CSS px）と 1 辺の長さ。
   * ヒーローではエビのドット絵の枠。距離の単位はこの 1 辺で、凪の波打ち際は中心から沖へ 0.66 の位置を通る
   */
  rect: readonly [number, number, number];
  /** エビ。省くと、砂浜と海だけを描く */
  shrimp?: ShrimpPose;
  palette: Palette;
}>;

export type ShoreRenderer = Readonly<{
  render: (scene: ShoreScene) => void;
  /** 描くのをやめ、WebGL のコンテキストを手放す */
  dispose: () => void;
}>;

/**
 * canvas に海辺を描く準備をする。WebGL が使えない環境では undefined を返す。
 */
export const createShoreRenderer = (
  canvas: HTMLCanvasElement,
): ShoreRenderer | undefined => {
  const gl = canvas.getContext('webgl', {
    antialias: false,
    alpha: false,
    powerPreference: 'low-power',
  });
  const program = gl ? createProgram(gl) : undefined;
  if (!gl || !program) return undefined;

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

  return {
    render: (scene) => {
      const { palette, shrimp } = scene;
      const width = Math.round(scene.width * scene.pixelRatio);
      const height = Math.round(scene.height * scene.pixelRatio);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
      gl.uniform2f(uniforms.uResolution, width, height);
      gl.uniform1f(uniforms.uPixelRatio, scene.pixelRatio);
      gl.uniform1f(uniforms.uTime, scene.time);
      gl.uniform1f(uniforms.uTide, scene.tide);
      gl.uniform4fv(uniforms.uWaveMotion, scene.waves.motion);
      gl.uniform4fv(uniforms.uWaveShape, scene.waves.shape);
      gl.uniform3f(uniforms.uRect, ...scene.rect);
      gl.uniform2f(uniforms.uOffset, ...(shrimp?.offset ?? [0, 0]));
      gl.uniform1f(uniforms.uRotation, shrimp?.rotation ?? 0);
      gl.uniform1f(uniforms.uCover, shrimp?.cover ?? 0);
      gl.uniform1f(uniforms.uVisible, shrimp?.visible ?? 0);
      gl.uniform1f(uniforms.uBuried, shrimp?.buried ?? 0);
      gl.uniform1f(uniforms.uBlink, shrimp?.blinking === true ? 0 : 1);
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
    },
    dispose: () => {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
};

export type Quality = Readonly<{
  /**
   * コマを描くたびに、その時刻（ミリ秒）を渡して呼ぶ。解像度に掛ける倍率（0.5〜1）を返す。
   * 描画が重い端末では、倍率を段階的に下げる
   */
  sample: (now: number) => number;
}>;

export const createQuality = (): Quality => {
  let quality = 1;
  let previousFrame: number | undefined;
  let slowTotal = 0;
  let slowCount = 0;
  return {
    sample: (now) => {
      if (previousFrame !== undefined && now - previousFrame < 200) {
        slowTotal += now - previousFrame;
        slowCount += 1;
      }
      previousFrame = now;
      if (slowCount >= 40) {
        if (slowTotal / slowCount > SLOW_FRAME && quality > 0.5) quality *= 0.8;
        slowTotal = 0;
        slowCount = 0;
      }
      return quality;
    },
  };
};
