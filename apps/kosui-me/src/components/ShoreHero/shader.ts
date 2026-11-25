/**
 * 海辺のシェーダー。真上から見た波打ち際を描く。
 *
 * 距離の単位はエビのドット絵 1 辺を 1 とする。波の先の式は wave.ts と同じ。変えるときは両方を直す。
 */

export const VERTEX_SHADER = /* glsl */ `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0., 1.);
}
`;

export const FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform vec2 uResolution;     // 描画先の大きさ（デバイスピクセル）
uniform float uPixelRatio;
uniform float uTime;          // 秒
uniform float uTide;          // スクロールで満ちた潮（0〜1）
uniform vec4 uWaveMotion[4];  // 波ごと: 岸に届いてからの秒数, 浜をのぼる距離, 寄せきるまでの秒数, 引ききるまでの秒数
uniform vec4 uWaveShape[4];   // 波ごと: 斜めに届く遅れ, 岸沿いのうねりの位相 ×3
uniform vec3 uRect;           // エビのドット絵の左上（CSS px）と 1 辺の長さ
uniform vec2 uOffset;         // エビの移動量（マス）
uniform float uRotation;      // エビの回転（ラジアン）
uniform float uCover;         // エビが水をかぶっている度合い（0〜1）
uniform float uVisible;       // エビの見え方（0〜1）
uniform float uBlink;         // 0 のあいだ目を閉じる
uniform float uGain;          // 光の強さ
uniform float uGrain;         // 砂粒の強さ
uniform float uSheen;         // 濡れた砂の照り返しの強さ
uniform float uFroth;         // 泡の濃さ
uniform vec3 uSand, uSeaShallow, uSeaDeep, uFoam, uLight, uShell, uEye;
uniform vec3 uWetTint;        // 濡れた砂に掛ける色
uniform vec3 uShadowTint;     // 影に掛ける色
uniform sampler2D uSprite, uShadow;
uniform sampler2D uPattern;   // r, g = 泡の穴の中心までの距離（大きい穴・小さい穴）, b, a = むら

const vec2 SEAWARD = vec2(.8944, -.4472);  // 海の方向（右上）
const vec2 ALONG = vec2(.4472, .8944);     // 波打ち際に沿う方向
const float EBB_LINE = .66;                // 凪の波打ち際。エビの最初の位置から沖へ

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

// 岸沿いのゆるいうねり（およそ -1〜1）。周期の合わない波を重ね、同じ形が並ばないようにする。
// 波の先や水際を、この形に出入りさせる。角や細かい凹凸は作らない
float swell(float a) {
  return .6 * sin(a + .8 * sin(a * .37 + 1.3)) + .28 * sin(a * 1.83 + 2.1) + .12 * sin(a * 3.1 + .7 * sin(a * .9));
}

// 画面上の位置から、ドット絵のマス座標へ。wobble は水越しの揺らぎの強さ
vec2 toCell(vec2 px, float t, float wobble) {
  vec2 q = (px - uRect.xy) / uRect.z * 20.;
  // 最初の波に乗って沖から運ばれ、波が止まるところで浜に残る
  float adrift = 1. - clamp(t / 2., 0., 1.);
  q -= uOffset + SEAWARD * 5.5 * adrift * adrift + ALONG * sin(t * 1.3) * .4 * uCover;
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

// 泡の濃さから、泡のあるところ（0〜1）を返す。
// 泡は穴のあいた膜で、薄れるほど穴が広がってつながり、細い筋だけが残る。
// holes は uPattern の値。小さい穴の距離は .686（= 1.2 × 16 / 28）を掛けて、大きい穴と同じ尺にそろえる
float laceOf(vec4 holes, float radius, float soften) {
  return smoothstep(-soften, soften, holes.r * 1.2 - radius)
    * smoothstep(-soften, soften, holes.g * .686 - .45 * radius);
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y) / uPixelRatio;
  vec2 uv = px / (uResolution / uPixelRatio);
  float t = uTime;
  float size = uRect.z;
  vec2 center = uRect.xy + size * .5;
  vec2 r = (px - center) / size;
  float s = dot(r, SEAWARD), a = dot(r, ALONG);
  float inland = EBB_LINE - s - uTide * 2.8;   // 浜をのぼる向きの座標。0 が凪の波打ち際

  // 砂に貼りついたむら（粗いもの・細かいもの）。乾き方や波の跡をばらつかせる
  vec4 coarse = texture2D(uPattern, vec2(a, s) * .55 + .3);
  vec4 fine = texture2D(uPattern, vec2(a, s) * 2.3);

  // 大きな波の合間も、小さな波が斜めに寄せては引く
  float lapPhase = fract(t * .31 - a * .23 + .11 * sin(a * 2.9 + t * .2));
  float lapTurn = lapPhase < .42 ? 1. - lapPhase / .42 : (lapPhase - .42) / .58;
  float lapInside = (.07 + .11 * (.5 + .5 * sin(t * .23 + a * 1.3))) * (1. - lapTurn * lapTurn) - inland
    + .025 * swell(a * 2.6 + t * .07);

  float inside = lapInside;   // 水際からの距離。正なら水の中
  float thinning = 0.;        // 引いていく水は薄い膜になり、縁がぼける
  float foam = 0.;            // 泡の濃さ
  float densest = 0.;         // いちばん濃い泡を残した波の、泡の濃さ
  float foamY = inland;       // その波の水といっしょに動く、泡の模様の座標
  float foamSeed = 0.;
  float flow = 0.;            // 水の動いた距離。水の下の模様をいっしょに流す
  float damp = 0.;            // 砂の濡れ具合
  float gloss = 0.;           // 引いた直後の、水の膜の照り返し
  float tideMark = 0.;        // 波がいちばん上まで届いたところに残る泡の線
  float frontLine = 0.;       // 波の先の白い線
  float streaking = 0.;       // 引き波の流れに沿った筋の強さ
  float streakY = 0.;
  float clash = 0.;           // 引き波が海とぶつかる強さ

  // 大きな波を 4 つまで重ねる。波の先は放物線を描いて浜をのぼり（速く寄せて止まる）、同じ放物線で加速しながら引く
  for (int k = 0; k < 4; k++) {
    vec4 motion = uWaveMotion[k], shape = uWaveShape[k];
    float uprush = motion.z, backwash = motion.w, drained = uprush + backwash;
    // 引ききってから十分たった波は、泡も濡れた跡も残っていないので飛ばす
    if (motion.x > drained + 16.) continue;
    // のぼる距離は岸沿いにうねり、岸には少し斜めに届く
    float reach = motion.y * (1. + .14 * sin(a * 1.9 + shape.y) + .07 * sin(a * 4.3 + shape.z));
    float since = motion.x - shape.x * a - .3 * sin(a * 1.3 + shape.w);
    // 波の先は岸沿いにゆるく出入りする。この波から見た位置を、その形にずらす
    float spot = inland - .07 * swell(a * 2.2 + shape.z * 3. + shape.w) * smoothstep(-.1, .7, inland);
    float approach = 1.5 * motion.y / uprush;                        // 沖から来る速さ
    float pace = sqrt(clamp(1. - spot / reach, 0., 1.));              // 波の先がここを通るときの速さ（岸に届いたときを 1 として）
    float passedAt = spot < 0. ? spot / approach : uprush * (1. - pace);   // 波の先がここを通る時刻
    float baredAt = uprush + backwash * pace;                         // 水が引いて、ここの砂が現れる時刻
    float ebb = clamp((since - uprush) / backwash, 0., 1.);           // 引き波の進み具合
    float rise = 1. - clamp(since / uprush, 0., 1.);
    float front = since < 0. ? approach * since
      : (since < uprush ? reach * (1. - rise * rise) : reach * (1. - ebb * ebb));   // 波の先の位置
    float behind = front - spot;                                      // 波の先からの距離。正なら波の先より沖

    // 水際。引ききった波は、そのまま海へ下がっていく
    float within = since < 0. ? -9.
      : (since > drained ? -(since - drained) * 2. * reach / backwash - spot : behind);
    if (within > inside) {
      inside = within;
      thinning = smoothstep(.05, .6, ebb);
    }

    // 泡は波の先で生まれ、時間とともに消える。勢いのある波ほど、たくさん残す
    float age = since - passedAt;                                     // 波の先が通ってからの秒数
    float covered = step(0., age) * step(spot, reach) * (spot < 0. ? 1. : step(since, baredAt));   // いまここに、この波の水がある
    float vigor = spot < 0. ? 1. : pace;
    float bubbles = covered * vigor * (.6 * exp(-max(age, 0.) / .12) + .4 * exp(-max(age, 0.) / 2.2));
    foam += bubbles;
    if (bubbles > densest) {
      densest = bubbles;
      foamY = (spot - .7 * front) / (1. + ebb);   // 泡の模様は水といっしょに動き、引き波で伸びる
      foamSeed = shape.y;
    }
    if (age >= 0. && spot < reach) flow = .5 * front;
    frontLine = max(frontLine,
      smoothstep(0., .004, behind) * (1. - smoothstep(.003 + .006 * vigor, .008 + .016 * vigor, behind))
      * step(since, drained) * (1. - smoothstep(0., .3, ebb)) * (.4 + .6 * vigor));
    float pull = covered * step(0., spot) * smoothstep(.2, .55, ebb) * (1. - smoothstep(.88, 1., ebb));
    if (pull > streaking) {
      streaking = pull;
      streakY = spot - front;
    }
    clash = max(clash, smoothstep(.55, .95, ebb) * (1. - smoothstep(0., 1.4, since - drained)));

    // 水が引いたあとの砂。濡れた跡は波の届いた線でくっきり残り、縁からゆっくり乾く
    float bared = since - baredAt;                                    // 砂が現れてからの秒数
    float sinceTurn = since - uprush;                                 // 波が寄せきってからの秒数
    float height = clamp(spot / 1.4, 0., 1.);                         // 浜の高いところほど、水の膜が早く消える
    float glossTime = mix(3.2, 1.2, height);
    float bare = step(0., bared) * step(0., spot)
      * (1. - smoothstep(reach - .008 - .05 * smoothstep(1., 9., sinceTurn), reach, spot + (fine.b - .5) * .025));
    damp = max(damp, bare * (1. - smoothstep(3., 13., sinceTurn + (coarse.b - .5) * 1.5)));
    gloss = max(gloss, bare * (1. - smoothstep(.55 * glossTime, glossTime, bared + coarse.a - .5)));
    tideMark = max(tideMark,
      step(uprush, since) * (1. - smoothstep(.004, .012, abs(reach - spot - .006))) * (1. - smoothstep(.5, 6.5, sinceTurn)));
  }

  // 小さな波の先にも白い線が立つ。大きな波の水の下では見えない
  frontLine = max(frontLine,
    smoothstep(0., .004, lapInside) * (1. - smoothstep(.005, .014, lapInside)) * step(lapPhase, .42) * step(inside, lapInside) * .55);
  float inWater = smoothstep(0., mix(.012, .08, thinning), inside);
  float depth = max(inside, 0.);
  damp = max(max(damp, inWater), 1. - smoothstep(.2, .3, inland));
  gloss *= 1. - inWater;

  // 水の下は屈折で少しずれて見える。そのゆらぎは水といっしょに流れる
  vec4 shimmer = texture2D(uPattern, (r + SEAWARD * flow) * .75 + vec2(t * .021, -t * .017));
  vec2 refracted = px + (shimmer.ba - .5) * size * .06 * smoothstep(0., .25, depth);

  // 砂
  vec4 sandNoise = texture2D(uPattern, refracted / size * .6);
  float grain = ((hash(floor(refracted * uPixelRatio)) - .5) * .05 + (noise(refracted * .9) - .5) * .045) * uGrain;
  float ripple = sin(dot((refracted - center) / size, SEAWARD) * 70. + sandNoise.a * 9.) * .5 + .5;
  vec3 col = uSand * (1. + grain + (sandNoise.b - .5) * .05 * uGrain - ripple * .007 * uGrain);
  col += uLight * step(.9965, hash(floor(refracted * 1.4) + 3.)) * .1 * uGain * mix(1., uGrain, .4);
  col = mix(col, col * uWetTint, damp * (.86 + .28 * sandNoise.b));
  col += uLight * gloss * (.06 + .11 * shimmer.b) * uGain * uSheen;
  col = mix(col, uFoam, tideMark * (1. - inWater) * .42 * smoothstep(.3, .55, fine.g));

  // エビの影
  float wobble = smoothstep(0., .1, inside);
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
  vec3 shrimp = mix(uShell, uEye, eye * uBlink) * mix(1., .93, damp);
  col = mix(col, shrimp, alpha);

  // 泡: 生まれたては白い帯。時間がたつと穴があいて網になり、ちぎれて消える
  foam = min(foam + .5 * clash * (1. - smoothstep(.03, .2, abs(inland + .03))), 1.);   // 引き波が海とぶつかるところにも立つ
  float lace = 0., laceShadow = 0., foamAlpha = 0., foamTone = 1.;
  if (foam > 0. || streaking > 0. || frontLine > 0.) {   // 泡のないところでは、模様を読まない
    vec2 foamUv = mat2(.8, .6, -.6, .8) * vec2(a, foamY * .6) * .95 + foamSeed * vec2(.37, .61);   // 網目は流れの向きに伸びる
    vec4 patches = texture2D(uPattern, foamUv * .23 + vec2(t * .007, -t * .005));   // 泡が濃く残るところと、抜けるところ
    vec4 warp = texture2D(uPattern, foamUv * .83 + vec2(-t * .013, t * .01));       // 網目のゆがみ
    vec2 warped = foamUv + (warp.ba - .5) * .06 + (patches.ba - .5) * .09;
    float density = foam * mix(.2, 1.5, smoothstep(.36, .64, patches.b)) + .5 * foam * foam * foam;
    float present = smoothstep(.02, .1, density);
    float holeRadius = .98 - 1.15 * pow(density, .75);
    float soften = .04 + 6. / (size * uPixelRatio);
    vec4 holes = texture2D(uPattern, warped);
    lace = laceOf(holes, holeRadius, soften) * present;
    laceShadow = laceOf(texture2D(uPattern, warped + vec2(-.0105, -.0058)), holeRadius, soften) * present;
    float streak = streaking * smoothstep(.6, .72, texture2D(uPattern, vec2(a * 3.7 + .5, streakY * .3)).b);   // 引き波の流れに沿った筋
    frontLine *= .3 + .7 * smoothstep(.34, .6, patches.a);   // 波の先の白い線も、濃いところと切れるところがある
    foamAlpha = max(
      max(lace * (.62 + .32 * clamp(density, 0., 1.)), streak * .16) * uFroth * inWater,
      frontLine * .92
    );
    foamTone = .95 + .05 * holes.g;
  }

  // 透明な水: 寄せた波は薄い膜で砂が透け、沖だけが深い色になる
  col *= 1. - .09 * laceShadow * (1. - lace) * inWater * smoothstep(.01, .08, depth);   // 泡が底に落とす影
  float offshore = max(s - .3, 0.);
  float thickness = min(depth, .3) * .5 * (1. - .45 * thinning) + offshore;
  vec3 sea = mix(uSeaShallow, uSeaDeep, 1. - exp(-offshore * 1.7));
  col = mix(col, sea, inWater * (.05 + .9 * (1. - exp(-thickness * 2.2))));
  if (inWater > 0.) {   // 光の網目は水の下にだけ映る
    col += uLight * caustic((r + SEAWARD * flow) * .85 + vec2(0., t * .02), t * .5) * .36
      * inWater * exp(-offshore * 1.4) * uGain * smoothstep(0., .07, depth) * (1. - .6 * foamAlpha);
  }
  col *= 1. - .12 * (1. - smoothstep(0., .045, inside)) * inWater * (1. - .7 * thinning);   // 水際は少し暗く縁どられる
  col += uLight * .07 * (1. - smoothstep(0., .12, inside)) * inWater * uGain;
  col = mix(col, uFoam * foamTone, foamAlpha);

  float vignette = 1. - smoothstep(.3, 1.3, length((uv - .5) * vec2(1.1, 1.)));
  col *= mix(.94, 1., vignette);
  col += (hash(gl_FragCoord.xy + t) - .5) * .012;
  gl_FragColor = vec4(col, 1.);
}
`;
