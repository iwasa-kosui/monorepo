/**
 * 海辺の配色を、でたらめに決める。海を押すたびに、海の色も浜の色も変わる。
 *
 * 色は OKLCH（明るさ・鮮やかさ・色相）で決める。色相は自由に選ぶが、明るさと鮮やかさは狭い幅に収める。
 * 浜の色はサイト全体の地の色でもあるので、どの色相でも文字が読める明るさにする。
 */

/** 配色のもとになる数。昼と夜の色は、同じ数から作る */
export type ShoreTone = Readonly<{
  /** 海の色相（度） */
  seaHue: number;
  /** 沖の色相を、浅瀬からどれだけずらすか（度） */
  deepShift: number;
  /** 海の深さ（0〜1）。大きいほど暗い */
  depth: number;
  /** 海の鮮やかさ（0〜1） */
  vivid: number;
  /** 浜の色相（度） */
  sandHue: number;
  /** 浜の色みの強さ（0〜1） */
  sandTint: number;
  /** 浜の明るさ（0〜1） */
  sandLight: number;
}>;

/** はじめの配色（珊瑚色の海）の、海の色相 */
export const INITIAL_SEA_HUE = 20;

/**
 * 海に使う色相の範囲（度）。緑から青、紫、赤をまわって珊瑚色まで。
 * 黄から橙のあたりは、沖の暗さにすると茶色く濁って見えるので使わない
 */
const SEA_HUE_FROM = 120;
const SEA_HUE_SPAN = 280;

/** 押すたびに、海の色相を少なくともこれだけ変える（度）。変わったことが見てわかる */
const MIN_HUE_STEP = 50;

/**
 * 次の配色のもとを決める。海の色相は、`previousSeaHue` から十分に離す。
 * `random` は 0 以上 1 未満の数を返す。
 */
export const randomTone = (
  random: () => number,
  previousSeaHue: number,
): ShoreTone => {
  // 使う範囲の端からの位置で考える。前の位置から、範囲を巻き戻りながら進む
  const previous = Math.min(SEA_HUE_SPAN, (previousSeaHue - SEA_HUE_FROM + 360) % 360);
  const position = (previous + MIN_HUE_STEP + random() * (SEA_HUE_SPAN - 2 * MIN_HUE_STEP)) % SEA_HUE_SPAN;
  // 沖の色相は浅瀬から少しずらすが、使う範囲の外へは出さない
  const deepPosition = Math.min(SEA_HUE_SPAN, Math.max(0, position + (random() - 0.5) * 50));
  return {
    seaHue: (SEA_HUE_FROM + position) % 360,
    deepShift: deepPosition - position,
    depth: random(),
    vivid: random(),
    sandHue: random() * 360,
    sandTint: random(),
    sandLight: random(),
  };
};

type Rgb = readonly [number, number, number];

const toSrgb = (linear: number): number => linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;

/** OKLCH から sRGB へ。表せない色は、成分が 0〜1 の外に出る */
const oklchToRgb = (lightness: number, chroma: number, hue: number): Rgb => {
  const angle = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(angle);
  const b = chroma * Math.sin(angle);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
};

const displayable = (rgb: Rgb): boolean => rgb.every((channel) => channel >= -0.0005 && channel <= 1.0005);

/**
 * OKLCH の色を 16 進 6 桁で返す。画面で表せない鮮やかさのときは、明るさと色相を保ったまま鮮やかさを下げる。
 */
export const oklchToHex = (
  lightness: number,
  chroma: number,
  hue: number,
): string => {
  let low = 0;
  let high = chroma;
  let rgb = oklchToRgb(lightness, chroma, hue);
  if (!displayable(rgb)) {
    for (let i = 0; i < 12; i++) {
      const middle = (low + high) / 2;
      if (displayable(oklchToRgb(lightness, middle, hue))) low = middle;
      else high = middle;
    }
    rgb = oklchToRgb(lightness, low, hue);
  }
  return `#${
    rgb
      .map((channel) =>
        Math.round(Math.min(1, Math.max(0, channel)) * 255)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  }`;
};

/** 配色のうち、でたらめに決める色。16 進 6 桁。ほかの色（エビ、影など）は global.css の値のまま */
export type ToneColors = Readonly<{
  sand: string;
  seaShallow: string;
  seaDeep: string;
  foam: string;
  light: string;
  wetTint: string;
}>;

/**
 * 配色のもとから、昼（`dark` が false）か夜（true）の色を作る。
 * 明るさと鮮やかさの幅は、手で決めた配色（珊瑚色の海、夜の青黒い海）のまわりに取ってある
 */
export const toneColors = (tone: ShoreTone, dark: boolean): ToneColors => {
  const { seaHue, depth, vivid, sandHue, sandTint, sandLight } = tone;
  const deepHue = seaHue + tone.deepShift;
  return dark
    ? {
      sand: oklchToHex(0.3 + 0.04 * sandLight, 0.025 + 0.025 * sandTint, sandHue),
      seaShallow: oklchToHex(0.54 - 0.08 * depth, 0.07 + 0.04 * vivid, seaHue),
      seaDeep: oklchToHex(0.17 - 0.04 * depth, 0.03 + 0.02 * vivid, deepHue),
      foam: oklchToHex(0.92, 0.025, seaHue),
      light: oklchToHex(0.82, 0.07, seaHue),
      // 夜の濡れた砂は、暗く青みがかった色のまま
      wetTint: '#a8aecb',
    }
    : {
      sand: oklchToHex(0.905 + 0.035 * sandLight, 0.012 + 0.026 * sandTint, sandHue),
      seaShallow: oklchToHex(0.82 - 0.09 * depth, 0.08 + 0.05 * vivid, seaHue),
      seaDeep: oklchToHex(0.52 - 0.14 * depth, 0.12 + 0.07 * vivid, deepHue),
      foam: oklchToHex(0.99, 0.006, seaHue),
      light: '#ffffff',
      // 濡れた砂は、海の色にわずかに寄る。赤みのある色のままだと、青い海と混ざって濁る
      wetTint: oklchToHex(0.85, 0.018, seaHue),
    };
};
