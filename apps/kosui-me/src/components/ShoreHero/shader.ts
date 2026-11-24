/**
 * 海辺のシェーダー。真上から見た波打ち際を描く。
 *
 * 距離の単位はエビのドット絵 1 辺を 1 とする。波の式は wave.ts と同じ。変えるときは両方を直す。
 */

export const VERTEX_SHADER = /* glsl */ `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0., 1.);
}
`;

export const FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform vec2 uResolution;   // 描画先の大きさ（デバイスピクセル）
uniform float uPixelRatio;
uniform float uTime;        // 秒
uniform float uTide;        // スクロールで満ちた潮（0〜1）
uniform float uCycleStart;  // いまの波の周期が始まった時刻
uniform vec2 uAmplitude;    // x = いまの波の強さ, y = 1 つ前の波の強さ
uniform vec3 uRect;         // エビのドット絵の左上（CSS px）と 1 辺の長さ
uniform vec2 uOffset;       // エビの移動量（マス）
uniform float uRotation;    // エビの回転（ラジアン）
uniform float uCover;       // エビが水をかぶっている度合い（0〜1）
uniform float uVisible;     // エビの見え方（0〜1）
uniform float uBlink;       // 0 のあいだ目を閉じる
uniform float uGain;        // 光の強さ
uniform float uGrain;       // 砂粒の強さ
uniform float uSheen;       // 濡れた砂の照り返しの強さ
uniform vec3 uSand, uSeaShallow, uSeaDeep, uFoam, uLight, uShell, uEye;
uniform vec3 uWetTint;       // 濡れた砂に掛ける色
uniform vec3 uShadowTint;    // 影に掛ける色
uniform sampler2D uSprite, uShadow;

const vec2 SEAWARD = vec2(.8944, -.4472);  // 海の方向（右上）
const vec2 ALONG = vec2(.4472, .8944);     // 波打ち際に沿う方向
const float PERIOD = 10.;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  return mix(
    mix(hash(i), hash(i + vec2(1, 0)), f.x),
    mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float v = 0., a = .5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= .5;
  }
  return v;
}

// 等高線のような細い筋
float ridge(vec2 p) {
  return 1. - abs(2. * fbm(p) - 1.);
}

// 水の下の砂に映る光の網目
float caustic(vec2 uv, float time) {
  vec2 p = mod(uv * 6.2831853, 6.2831853) - 250.;
  vec2 i = p;
  float c = 1.;
  float inten = .005;
  for (int n = 0; n < 4; n++) {
    float t = time * (1. - (3.5 / float(n + 1)));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1. / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
  }
  c /= 4.;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.);
}

// 波の寄せ引き: 速く寄せて、ゆっくり引く
// 周期の境目は JS から受け取る。シェーダー側で数え直すと、丸め誤差で境目の 1 コマだけ食い違う
float swash(float t) {
  float since = t - uCycleStart;
  float ph = clamp(since < 0. ? since / PERIOD + 1. : since / PERIOD, 0., 1.);
  float amp = since < 0. ? uAmplitude.y : uAmplitude.x;
  float u = ph < .36 ? 1. - pow(1. - ph / .36, 2.4) : pow(1. - (ph - .36) / .64, 1.7);
  return u * amp;
}

// 波打ち際の位置。a は波打ち際に沿った位置。小さいほど陸側
float shore(float a, float t) {
  float u = swash(t);
  float lobe = noise(vec2(a * 1.25, t * .11)) - .5;
  float lobe2 = noise(vec2(a * 3.3 + 5., t * .17)) - .5;
  return mix(.66, -.7, u) + (lobe * .36 + lobe2 * .1) * (.35 + .9 * u) - uTide * 2.8;
}

// 波打ち際が位置 s まで来るのに必要な寄せ具合。at はそのときの時刻
float needed(float s, float a, float at) {
  float lobe = (noise(vec2(a * 1.25, at * .11)) - .5) * .36 + (noise(vec2(a * 3.3 + 5., at * .17)) - .5) * .1;
  return (.66 + .35 * lobe - uTide * 2.8 - s) / (1.36 - .9 * lobe);
}

// cycleStart から始まる波の引き波が、位置 s を通り過ぎた時刻。
// reached は、その波がそこまで届いたか（0〜1。届いた範囲の縁でなだらかに 0 になる）
float passedAt(float s, float a, float cycleStart, float amp, out float reached) {
  float at = cycleStart + .36 * PERIOD;   // まず、寄せきった時刻の波の形で見積もる
  float profile = 0.;
  for (int i = 0; i < 2; i++) {
    profile = needed(s, a, at) / amp;
    at = cycleStart + (.36 + .64 * (1. - pow(clamp(profile, 0., 1.), 1. / 1.7))) * PERIOD;
  }
  reached = 1. - smoothstep(.9, 1., profile);
  return at;
}

// 濡れてからの秒数に対する、砂の濡れ具合。段をつけず、なだらかに乾く
float dryness(float seconds) {
  return 1. - smoothstep(.5, 11., seconds);
}

// 画面上の位置から、ドット絵のマス座標へ。wobble は水越しの揺らぎの強さ
vec2 toCell(vec2 px, float t, float wobble) {
  vec2 q = (px - uRect.xy) / uRect.z * 20.;
  // 最初の波に運ばれてくる
  q -= uOffset + SEAWARD * 5.5 * (1. - smoothstep(0., 2.8, t)) + ALONG * sin(t * 1.3) * .4 * uCover;
  float an = uRotation + sin(t * 1.1) * .07 * uCover;
  vec2 c = q - vec2(9.5);
  q = vec2(c.x * cos(an) + c.y * sin(an), -c.x * sin(an) + c.y * cos(an)) + vec2(9.5);
  q += vec2(
    sin(q.y * .42 + t * 1.5) + .5 * sin(q.y * .9 - t * 1.1 + 2.),
    sin(q.x * .38 + t * 1.25 + 1.7) + .5 * sin(q.x * .8 + t * .9)
  ) * .24 * wobble;
  return q;
}

// x = 絵のあるマスか, y = 目のマスか
vec2 sprite(vec2 q) {
  if (q.x < 0. || q.y < 0. || q.x >= 20. || q.y >= 20.) return vec2(0.);
  vec4 s = texture2D(uSprite, (floor(q) + .5) / 20.);
  return vec2(step(.5, s.a), step(.5, s.r));
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y) / uPixelRatio;
  vec2 uv = px / (uResolution / uPixelRatio);
  float t = uTime;
  float size = uRect.z;
  vec2 center = uRect.xy + size * .5;
  vec2 r = (px - center) / size;
  float s = dot(r, SEAWARD), a = dot(r, ALONG);

  float line = shore(a, t);
  float w = s - line;                       // 正なら水の中
  float inWater = smoothstep(0., .012, w);
  float depth = max(w, 0.);

  // 濡れた砂: 引き波が通り過ぎてからの時間で、その場でゆっくり乾いていく
  float phase = clamp((t - uCycleStart) / PERIOD, 0., 1.);
  float reachedNow, reachedBefore;
  float passedNow = passedAt(s, a, uCycleStart, uAmplitude.x, reachedNow);
  float passedBefore = passedAt(s, a, uCycleStart - PERIOD, uAmplitude.y, reachedBefore);
  // いまの波がまだここを引いていなければ、1 つ前の波の跡だけが残っている
  float wetNow = t >= passedNow ? reachedNow * dryness(t - passedNow) : 0.;
  float wet = max(max(wetNow, reachedBefore * dryness(t - passedBefore)), inWater);

  // 水の下は屈折で少しずれて見える
  vec2 refracted = px + (vec2(
    noise(px * .012 + vec2(t * .35, 0.)),
    noise(px * .012 + vec2(7., -t * .3))
  ) - .5) * size * .05 * smoothstep(0., .25, depth);

  // 砂
  float grain = ((hash(floor(refracted * uPixelRatio)) - .5) * .05 + (noise(refracted * .9) - .5) * .045) * uGrain;
  float mottle = fbm(refracted / size * 2.6) - .5;
  float ripple = sin(dot((refracted - center) / size, SEAWARD) * 70. + fbm(refracted / size * 2.4) * 9.) * .5 + .5;
  vec3 col = uSand * (1. + grain + mottle * .05 * uGrain - ripple * .007 * uGrain);
  col += uLight * step(.9965, hash(floor(refracted * 1.4) + 3.)) * .1 * uGain * mix(1., uGrain, .4);
  col = mix(col, col * uWetTint, wet);
  float fresh = wet * exp(-max(line - s, 0.) * 3.6);
  col += uLight * (.02 + .2 * fresh) * wet * uGain * uSheen * (.55 + .45 * noise(refracted * .018 + t * .05));

  float fine = fbm(vec2(a * 7., s * 7.) + t * .05);

  // 引いたあとの砂に残る細い泡の線
  if (phase > .36) {
    float peak = shore(a, uCycleStart + .36 * PERIOD);
    float residue = 1. - smoothstep(0., .006, abs(s - peak - .008) - .004 * fine);
    col = mix(col, uFoam, residue * (1. - inWater) * (1. - smoothstep(.36, .9, phase)) * .38 * smoothstep(.3, .5, fine));
  }

  // エビの影
  float wobble = smoothstep(0., .1, w);
  vec2 sq = (toCell(px - vec2(.016, .024) * size, t, wobble) + 2.) / 24.;
  float shadow = (sq.x < 0. || sq.y < 0. || sq.x > 1. || sq.y > 1.) ? 0. : texture2D(uShadow, sq).r;
  float arrived = smoothstep(0., .9, t);
  col = mix(col, col * uShadowTint, shadow * .55 * arrived * (1. - .4 * inWater) * (1. - .6 * uCover) * uVisible);

  // エビ（4 点で縁をならす）。水をかぶっている部分だけ揺らぐ
  vec2 acc = vec2(0.);
  float o = .25;
  acc += sprite(toCell(px + vec2(-o, -o), t, wobble));
  acc += sprite(toCell(px + vec2(o, -o), t, wobble));
  acc += sprite(toCell(px + vec2(-o, o), t, wobble));
  acc += sprite(toCell(px + vec2(o, o), t, wobble));
  float alpha = acc.x * .25 * arrived * uVisible;
  float eye = acc.x > 0. ? acc.y / acc.x : 0.;
  vec3 shrimp = mix(uShell, uEye, eye * uBlink) * mix(1., .93, wet);
  col = mix(col, shrimp, alpha);

  // 透明な水: 寄せた波は薄い膜で砂が透け、沖だけが深い色になる
  float offshore = max(s - .3, 0.);
  float thickness = min(depth, .3) * .5 + offshore;
  vec3 sea = mix(uSeaShallow, uSeaDeep, 1. - exp(-offshore * 1.7));
  col = mix(col, sea, inWater * (.05 + .9 * (1. - exp(-thickness * 2.2))));
  col += uLight * caustic(px / size * .85 + vec2(0., t * .02), t * .5) * .36 * inWater * exp(-offshore * 1.4) * uGain;

  // 泡: 濁った塊にせず、輪郭のはっきりした細い線の網と筋で描く
  float advancing = phase < .36 ? 1. : .55;
  col *= 1. - .12 * (1. - smoothstep(0., .045, w)) * inWater;
  float edge = (1. - smoothstep(0., .013 + .01 * fine, w)) * step(0., w) * (.5 + .5 * fine) * advancing;
  float lace = smoothstep(.9, .975, ridge(vec2(a * 8., w * 8. - t * .35))) * (1. - smoothstep(.03, .24, w)) * inWater * advancing * .75;
  float streak = smoothstep(.93, .985, ridge(vec2(a * 2.2 - t * .05, w * 11. - t * .22))) * exp(-depth * 2.8) * inWater * .5;
  col += uLight * .07 * (1. - smoothstep(0., .12, w)) * inWater * uGain;
  col = mix(col, uFoam, clamp(edge + lace + streak, 0., 1.) * .82);

  float vignette = 1. - smoothstep(.3, 1.3, length((uv - .5) * vec2(1.1, 1.)));
  col *= mix(.94, 1., vignette);
  col += (hash(gl_FragCoord.xy + t) - .5) * .012;
  gl_FragColor = vec4(col, 1.);
}
`;
