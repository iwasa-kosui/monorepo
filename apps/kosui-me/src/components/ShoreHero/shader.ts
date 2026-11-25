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
uniform float uBuried;        // エビが砂に埋もれている度合い（0〜1）
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

// 浜に広がる水の縁の形（およそ -.4〜.6）。実物の波打ち際と同じく、陸へ張り出す弧がいくつも重なり、
// 弧と弧の間は沖へ鋭く切れ込む。弧の幅と高さは 1 つずつ大きくちがい、細く高い弧は舌のように突き出す。
// 弧のないところは平らな縁になる。x が 1 進むごとに弧が 1 つ。seed を変えると別の並びになる
float lobes(float x, float seed) {
  float cell = floor(x), sum = 1.;
  for (int n = -1; n <= 1; n++) {
    float c = cell + float(n);
    float h1 = hash(vec2(c, seed)), h2 = hash(vec2(seed + 3.7, c));
    float d = (x - c - .5 - (h1 - .5) * .5) / (.35 + .6 * h2);
    sum += exp(16. * (.25 + .75 * fract(h1 * 7.3 + h2)) * (1. - d * d));
  }
  return log(sum) / 16. - .4;
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

// x = 絵のあるマスか, y = 目のマスか。
// 砂に埋もれている間は、マスごとに砂のかぶり方がちがい、浅いマスから現れる（体のまんなかほど浅い）
vec2 sprite(vec2 q) {
  if (q.x < 0. || q.y < 0. || q.x >= 20. || q.y >= 20.) return vec2(0.);
  vec2 cell = floor(q);
  vec4 s = texture2D(uSprite, (cell + .5) / 20.);
  float sandOver = .55 * hash(cell + 11.) + .03 * length(cell - vec2(11., 9.));
  float shown = step(.5, s.a) * smoothstep(sandOver, sandOver + .2, 1. - uBuried);
  return vec2(shown, shown * step(.5, s.r));
}

// 泡の濃さから、泡のあるところ（0〜1）を返す。
// 泡は穴のあいた膜で、薄れるほど穴が広がってつながり、細い筋だけが残る。
// holes は uPattern の値。小さい穴の距離は .686（= 1.2 × 16 / 28）を掛けて、大きい穴と同じ尺にそろえる。
// rough で穴の縁をゆがめる。実物の穴は丸くなく、いびつな形をしている
float laceOf(vec4 holes, float radius, float soften, float rough) {
  return smoothstep(-soften, soften, holes.r * 1.2 - radius + rough)
    * smoothstep(-soften, soften, holes.g * .686 - .45 * radius + .5 * rough);
}

// 水の縁に寄り集まった泡の帯。x = 泡のあるところ（0〜1）, y = 泡の明るさ。
// along は岸沿いの位置、dist は水の縁から沖へ測った距離。strength（0〜1）が小さいほど細い。
// 陸側の端は水の縁そのもので、くっきりしている。帯は途切れずに続くが、太さは岸沿いにむらがある。
// 沖側の端はむらに沿ってちぎれ、後ろの泡の網につながる。泡は細かい粒の集まりで、粒の間がわずかに暗い。
// lift は波の高さ。高い波の泡は太い
vec2 frothBand(float along, float dist, float seed, float strength, float soften, float lift) {
  vec4 clumps = texture2D(uPattern, vec2(along * .9 + seed * .13, seed * .29));
  vec4 grains = texture2D(uPattern, vec2(along, dist) * 4.6 + seed * vec2(.37, .61));
  float clump = smoothstep(.4, .68, clumps.b);
  float width = strength * ((1. + .9 * lift) * (.012 + .05 * clump * clump + .014 * smoothstep(.35, .65, clumps.a)) + .035 * lift);
  float ragged = width * (.55 + 1.1 * smoothstep(.3, .7, grains.b));
  float band = smoothstep(-soften, soften, ragged - dist) * smoothstep(-soften, soften, dist);
  float tone = 1. - .1 * smoothstep(.45, .9, grains.g * .686) - .06 * smoothstep(.5, 1., dist / max(width, .001));
  return vec2(band, tone);
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

  // 水の縁の細かな出入り。泡の縁の幅ほどの、小さな弧が並ぶ
  float ruffle = lobes(a * 9.5, 3.);

  // 大きな波の合間も、小さな波が斜めに寄せては引く
  float lapPhase = fract(t * .31 - a * .23 + .11 * sin(a * 2.9 + t * .2));
  float lapTurn = lapPhase < .42 ? 1. - lapPhase / .42 : (lapPhase - .42) / .58;
  float lapInside = (.07 + .11 * (.5 + .5 * sin(t * .23 + a * 1.3))) * (1. - lapTurn * lapTurn) - inland
    + .045 * lobes(a * 2.3 + t * .03, 5.) + .015 * ruffle;

  float inside = lapInside;   // 水際からの距離。正なら水の中
  float water = smoothstep(0., .012, lapInside);   // 水の見え方（0〜1）。引いていく薄い膜は、ほとんど見えない
  float thinning = 0.;        // 引いていく水は薄い膜になる
  float sheen = 0.;           // 引いていく薄い膜の照り返し
  float swell = 0.;           // 崩れた波の先の後ろに盛り上がった、水の高さ
  float ridge = 0.;           // 浜にぶつかる前の、切り立った波の高さ
  // 切り立った波の、前の斜面。斜面の上かどうかと、斜面のどこか（0 = 裾, 1 = 峰）を覚える
  float wall = 0., wallAcross = 0., wallSeed = 0.;
  float foam = 0.;            // 水に浮いている泡の濃さ
  float densest = 0.;         // いちばん濃い泡を残した波の、泡の濃さ
  float foamY = inland;       // その波の水といっしょに動く、泡の模様の座標
  float foamSeed = 0.;
  float foamDrag = 0.;        // その泡が、引き波に引かれた度合い
  // 水が引いたあと、砂に取り残された泡。濃さと、取り残されてからの秒数、取り残されたときの模様を覚える
  float strand = 0., strandAge = 0., strandY = 0., strandSeed = 0., strandDrag = 0.;
  float washed = 0.;          // 1 なら、ここは波がのぼった浜の上
  float flow = 0.;            // 水の動いた距離。水の下の模様をいっしょに流す
  float damp = 0.;            // 砂の濡れ具合
  float gloss = 0.;           // 引いた直後の、水の膜の照り返し
  // 波の先の泡の縁。いちばん近い波の先について、そこからの距離と、泡の残り具合を覚える
  float rimNear = 0., rimDist = 0., rimStrength = 0., rimSeed = 0., rimLift = 0.;
  // 波がいちばん上まで届いたところに置いていかれた泡。その線からの距離と、置かれてからの秒数を覚える
  float markNear = 0., markDist = 0., markAge = 0., markSeed = 0.;
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
    // 波の先は、大きさのちがう弧が三重に重なった形。この波から見た位置を、その形にずらす
    float spot = inland - (
      .15 * lobes(a * 1.1 + .35 * sin(a * 1.1 + shape.w), shape.z * 9.)
      + .06 * lobes(a * 3.1 + shape.y, shape.w * 9.)
      + .02 * ruffle
    ) * smoothstep(-.15, .35, inland);
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
    float thin = smoothstep(.05, .6, ebb);
    if (within > inside) {
      inside = within;
      thinning = thin;
    }
    // 引いていく水は、縁へ向かって薄い膜になる。膜は砂が透けて、むらになって消えるので、水際の線は見えない
    float visible = smoothstep(0., mix(.012, .34, thin), within - thin * (.1 * fine.b + .12 * coarse.a));
    water = max(water, visible);
    sheen = max(sheen, step(0., within) * smoothstep(0., .3, thin) * (1. - visible));

    // 波は、浜にぶつかるまで切り立った山のまま寄せてくる。岸に近づくにつれて高くなり、高さを保ったまま届く。
    // 真上からは、手前に色の深い斜面、その奥に白波の立つ峰が見える。峰の高さは山脈のように岸沿いでちがい、
    // 白波はところどころ斜面を下る。浜にぶつかると峰が前へ崩れ、白波が波の先まで届いて、薄い水になって浜をのぼる
    float shoal = smoothstep(-2.6, -1.2, since);                      // 沖では低く、岸に近づくにつれて高くなる
    float stand = shoal * (1. - smoothstep(.3, .6, 1. - rise * rise));   // 山のまま立っている度合い。浜をのぼり始めると崩れる
    float grand = clamp(motion.y, .6, 1.3);                           // 波の大きさ
    float tall = rise * grand;                                        // 崩れたあとの波の先の高さ。浜をのぼるうちに低くなる
    swell = max(swell, tall * step(0., behind) * exp(-behind / .28));
    float crest = 0.;                                                 // 波の先から、峰の白波までの距離
    if (stand > 0.) {
      float peak = .6 + .8 * clamp(lobes(a * 1.7 + shape.w * 3., shape.y * 5.) + .4, 0., 1.);
      float slope = .13 * grand * peak * stand;                       // 真上から見た斜面の幅
      crest = slope * (1. - .7 * clamp(lobes(a * 5.3 + shape.z * 3., shape.w * 4.) + .4, 0., 1.));
      float onWave = step(0., behind);
      ridge = max(ridge, stand * grand * peak * onWave * smoothstep(0., slope, behind) * exp(-max(behind - slope, 0.) / .4));
      float onWall = stand * onWave * (1. - smoothstep(-.01, .01, behind - crest));
      if (onWall > wall) {
        wall = onWall;
        wallAcross = behind / max(crest, .001);
        wallSeed = shape.y;
      }
    }
    float aft = behind - crest;                                       // 白波の前の縁からの距離。正なら縁より沖

    // 泡は波の先で生まれ、水に浮いている間にゆっくり消える。勢いのある波ほど、たくさん残す。
    // 引き波では、水際は泡より速く下がる。泡は水に置いていかれて砂に取り残され、その場で弾けて消える
    float age = since - passedAt;                                     // 波の先が通ってからの秒数
    float swept = step(0., age) * step(spot, reach);                  // この波の先が、ここを通った
    float ashore = spot < 0. ? 0. : max(since - baredAt, 0.);         // 泡が砂に取り残されてからの秒数
    float covered = swept * step(ashore, 0.);                         // いまここに、この波の水がある
    float afloat = max(age - ashore, 0.);                             // 泡が水に浮いていた秒数
    float vigor = spot < 0. ? shoal : .25 + .75 * pace;               // 浜の高いところへ届く頃には、泡は減っている
    float floating = vigor * (.6 * exp(-afloat / .12) + .2 * exp(-afloat / 1.2) + .2 * exp(-afloat / 9.));   // 生まれたての泡はすぐに減るが、残った泡は長く浮いている
    float dragged = min(ebb, pace);                                   // 引き波に引かれた度合い。取り残されたあとは変わらない
    float carriedY = (spot - .7 * max(front, spot)) / (1. + dragged); // 泡の模様は水といっしょに動き、引き波で伸びる。取り残されたあとは動かない
    float height = clamp(spot / 1.4, 0., 1.);                         // 浜の高いところほど、水が早く砂に吸われる
    // 泡は波の先に寄り集まって、いっしょに浜をのぼる。のぼるうちに減り、引き始めると砂に置いていかれる。
    // そのすぐ後ろには、ちぎれた泡が尾を引く
    float held = shoal * step(since, drained) * (since < uprush ? .45 + .55 * rise : .45 * (1. - smoothstep(0., .45, ebb)));
    // 切り立った波の斜面には、まだ泡がない。峰の奥の背にも少ない。崩れると、いちどに泡立つ
    float bubbles = covered * smoothstep(-.01, .01, aft) * (1. - .85 * stand)
      * (floating + held * (.5 * (1. - smoothstep(0., .08, aft)) + .3 * (1. - smoothstep(0., .4, aft))));
    foam += bubbles;
    if (bubbles > densest) {
      densest = bubbles;
      foamY = carriedY;
      foamSeed = shape.y;
      foamDrag = dragged;
    }
    if (swept > 0.) {   // 前の波が残した泡は、この波が洗い流す
      float life = mix(8., 4., height);   // 砂の上の泡が消えきるまでの秒数。水が早く吸われる高いところほど短い
      float popping = 1. - smoothstep(.1 * life, life, ashore + (fine.b - .5) * 1.2 * life);   // ところどころから弾ける
      strand = (1. - covered) * (floating + .36 * (1. - smoothstep(0., .45, pace))) * popping;
      strandAge = ashore;
      strandY = carriedY;
      strandSeed = shape.y;
      strandDrag = dragged;
      washed = step(0., spot);
    }
    if (age >= 0. && spot < reach) flow = .5 * front;
    float near = held * step(-.02, aft) * (1. - smoothstep(0., .3, aft));
    if (near > rimNear) {
      rimNear = near;
      rimDist = aft;
      rimStrength = held;
      rimSeed = shape.y;
      rimLift = max(tall, 1.5 * stand * grand);
    }
    float pull = covered * step(0., spot) * smoothstep(.2, .55, ebb) * (1. - smoothstep(.88, 1., ebb))
      * smoothstep(0., .15, behind);   // 膜の薄い水際では、筋も薄れる
    if (pull > streaking) {
      streaking = pull;
      streakY = spot - front;
    }
    clash = max(clash, smoothstep(.55, .95, ebb) * (1. - smoothstep(0., 1.4, since - drained)));

    // 水が引いたあとの砂。濡れた跡は波の届いた線でくっきり残り、縁からゆっくり乾く
    float bared = since - baredAt;                                    // 砂が現れてからの秒数
    float sinceTurn = since - uprush;                                 // 波が寄せきってからの秒数
    float glossTime = mix(3.2, 1.2, height);                          // 浜の高いところほど、水の膜が早く消える
    float bare = step(0., bared) * step(0., spot)
      * (1. - smoothstep(reach - .008 - .05 * smoothstep(1., 9., sinceTurn), reach, spot + (fine.b - .5) * .025));
    damp = max(damp, bare * (1. - smoothstep(3., 13., sinceTurn + (coarse.b - .5) * 1.5)));
    gloss = max(gloss, bare * (1. - smoothstep(.55 * glossTime, glossTime, bared + coarse.a - .5)));
    if (age >= 0. && spot < reach) markNear = 0.;   // 前の波が置いていった泡は、この波が洗い流す
    float left = step(uprush, since) * (1. - smoothstep(9., 14., sinceTurn))
      * step(-.02, reach - spot) * (1. - smoothstep(0., .12, reach - spot));
    if (left > markNear) {
      markNear = left;
      markDist = reach - spot;
      markAge = sinceTurn;
      markSeed = shape.y;
    }
  }

  // 小さな波の先にも、細い泡の縁が立つ。大きな波の水の下では見えない
  float lapNear = .3 * step(lapPhase, .42) * step(inside, lapInside) * step(-.02, lapInside) * (1. - smoothstep(0., .12, lapInside));
  if (lapNear > rimNear) {
    rimNear = lapNear;
    rimDist = lapInside;
    rimStrength = .3;
    rimSeed = 4.2;
    rimLift = 0.;
  }
  float submerged = smoothstep(-.012, 0., inside);   // 薄い膜でも、水のあるところ
  float inWater = water;
  float depth = max(inside, 0.);
  damp = max(max(damp, submerged), 1. - smoothstep(.2, .3, inland));
  // 薄い膜は、水が引いた直後の砂と同じように照り返す。水際の前後で、見え方が変わらない
  gloss = max(gloss * (1. - inWater), min(sheen, 1. - inWater));

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
  // 砂に置いていかれた泡は、ところどころから弾けて消える
  float edgeSoften = .002 + 1.5 / (size * uPixelRatio);
  if (markNear > 0.) {
    float popped = smoothstep(.5, 13., markAge + (fine.b - .5) * 9.);
    vec2 mark = frothBand(a, markDist, markSeed, .45 * (1. - .6 * popped), edgeSoften, 0.);
    col = mix(col, uFoam * mark.y, mark.x * (1. - inWater) * .85 * (1. - popped) * mix(1., uFroth, .5));
  }

  // エビの影
  float wobble = smoothstep(0., .1, inside) * (.3 + .7 * inWater);
  vec2 sq = (toCell(px - vec2(.016, .024) * size, t, wobble) + 2.) / 24.;
  float shadow = (sq.x < 0. || sq.y < 0. || sq.x > 1. || sq.y > 1.) ? 0. : texture2D(uShadow, sq).r;
  float arrived = smoothstep(0., .9, t);
  col = mix(col, col * uShadowTint, shadow * .55 * arrived * (1. - .4 * inWater) * (1. - .6 * uCover) * uVisible * smoothstep(.3, 1., 1. - uBuried));

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

  // 泡: 生まれたては白い帯。時間がたつと穴があいて網になり、ちぎれて消える。
  // 水が引いても泡はすぐには消えず、波の届いたところまで砂の上に残る
  foam = min(foam + .5 * clash * (1. - smoothstep(.03, .2, abs(inland + .03))) * inWater, 1.);   // 引き波が海とぶつかるところにも立つ
  float beached = strand > foam ? 1. : 0.;   // 1 なら、ここの泡は砂に取り残されたもの
  float amount = max(foam, strand);
  float lace = 0., laceShadow = 0., foamAlpha = 0., foamTone = 1.;
  if (amount > 0. || streaking > 0.) {   // 泡のないところでは、模様を読まない
    float laceY = mix(foamY, strandY, beached), laceSeed = mix(foamSeed, strandSeed, beached);
    float laceTime = t - beached * strandAge;   // 砂の上の泡は流れない。取り残されたときの模様のまま止まる
    vec2 foamUv = mat2(.8, .6, -.6, .8) * vec2(a, laceY * .6) * .95 + laceSeed * vec2(.37, .61);   // 網目は流れの向きに伸びる
    vec4 patches = texture2D(uPattern, foamUv * .23 + vec2(laceTime * .007, -laceTime * .005));   // 泡が濃く残るところと、抜けるところ
    vec4 warp = texture2D(uPattern, foamUv * .83 + vec2(-laceTime * .013, laceTime * .01));       // 網目のゆがみ
    vec2 warped = foamUv + (warp.ba - .5) * .06 + (patches.ba - .5) * .09;
    // 引き波は泡を流れの向きに梳く。泡は、流れに沿ったぼんやりした筋になって残る
    float comb = smoothstep(.36, .64, texture2D(uPattern, vec2(a * 2.7 + laceSeed * .4 + (patches.a - .5) * .5, s * .4 + .5)).b);
    float combed = .75 * smoothstep(.1, .6, mix(foamDrag, strandDrag, beached)) * (1. - smoothstep(.25, .6, amount));   // 濃い泡は梳かれにくい
    float density = amount * mix(.2, 1.5, smoothstep(.36, .64, patches.b)) * mix(1., .45 + 1.1 * comb, combed) + .5 * amount * amount * amount;
    float present = smoothstep(.02, .1, density);
    float holeRadius = .98 - 1.15 * pow(density, .75);
    float crisp = .04 + 6. / (size * uPixelRatio);
    float soften = crisp + .14 * beached * smoothstep(0., .6, strandAge);   // 砂に残った泡は、縁がぼやける
    vec4 holes = texture2D(uPattern, warped);
    float rough = (texture2D(uPattern, foamUv * 2.7 + .31).b - .5) * .9;   // 穴の縁は、穴より細かいむらでゆがむ
    lace = laceOf(holes, holeRadius, soften, rough) * present;
    laceShadow = laceOf(texture2D(uPattern, warped + vec2(-.0105, -.0058)), holeRadius, soften, rough) * present;
    if (beached > 0.) {
      // 砂の上の泡は、網の糸がその場でほどけて、細かい粒の集まりになっていく。粒は、泡の薄いところから弾けて減る
      vec4 beadCells = texture2D(uPattern, vec2(a, s) * 1.9 + .17);
      float beadRadius = .24 + .3 * smoothstep(0., .35, density) + (fine.a - .5) * .3;
      float beadSoften = .06 + 7. / (size * uPixelRatio);
      vec2 beadEdge = vec2(beadCells.g * 1.2 - beadRadius, beadCells.r * 1.2 - .7 * beadRadius);   // 粒の縁からの距離（小さい粒・大きい粒）
      vec2 bead = (1. - smoothstep(-beadSoften, beadSoften, beadEdge)) * (.65 + .35 * smoothstep(-.3, -.05, beadEdge));   // 粒は膜でできていて、まんなかが少し透ける
      float beads = max(bead.x, bead.y) * laceOf(holes, holeRadius - .25, crisp + .12, rough) * present;   // 粒は、糸のあったあたりに散らばる
      lace = mix(lace, beads, smoothstep(0., 1.4, strandAge));
    }
    float streak = streaking * smoothstep(.6, .72, texture2D(uPattern, vec2(a * 3.7 + .5, streakY * .3)).b);   // 引き波の流れに沿った筋
    // 浜の上では、水際をまたいで泡がつながる。浮いている泡と砂に残った泡を、水際で切らない
    float shown = mix(max(inWater, washed), .85, beached);
    foamAlpha = max(lace * (.62 + .32 * clamp(density, 0., 1.)) * shown, streak * .16 * submerged) * uFroth;
    foamTone = .95 + .05 * holes.g;
  }

  if (rimNear > 0.) {   // 波の先の泡の縁
    vec2 rim = frothBand(a, rimDist, rimSeed, rimStrength, edgeSoften, rimLift);
    float rimAlpha = rim.x * .95 * smoothstep(0., .2, rimStrength) * mix(1., uFroth, .5);
    foamTone = mix(foamTone, rim.y, rim.x);
    foamAlpha = max(foamAlpha, rimAlpha);
    // 泡の縁は砂から少し盛り上がり、すぐ外の砂に細い影を落とす
    col *= 1. - .14 * smoothstep(-.012, -.002, rimDist) * (1. - smoothstep(-.002, .002, rimDist)) * min(1., rimStrength * 2.);
  }

  // 透明な水: 浜の上の水は浅く、砂が透ける。切り立った波と、沖だけが深い色になる
  col *= 1. - .09 * laceShadow * (1. - lace) * inWater * smoothstep(.01, .08, depth);   // 泡が底に落とす影
  float offshore = max(s - .3, 0.);
  float thickness = min(depth, .3) * .5 * (1. - .45 * thinning) + .45 * swell + .9 * ridge + offshore;
  vec3 sea = mix(uSeaShallow, uSeaDeep, 1. - exp(-(offshore + .5 * ridge) * 1.7));
  col = mix(col, sea, inWater * (.05 + .9 * (1. - exp(-thickness * 2.2))));
  if (inWater > 0.) {   // 光の網目は水の下にだけ映る
    col += uLight * caustic((r + SEAWARD * flow) * .85 + vec2(0., t * .02), t * .5) * .36
      * inWater * exp(-offshore * 1.4) * uGain * smoothstep(0., .07, depth) * (1. - .6 * foamAlpha) * (1. - .7 * min(ridge, 1.));
  }
  if (wall > 0.) {
    // 斜面は裾から峰へ向かって色が深くなり、峰のすぐ下がいちばん暗い。細い泡の筋が、峰へ引き上げられていく
    float veins = smoothstep(.5, .68, texture2D(uPattern, vec2(a * 6.1 + wallSeed, wallAcross * .07 + wallSeed * .7)).b);
    col *= 1. - .2 * wall * smoothstep(.3, 1., wallAcross);
    foamAlpha = max(foamAlpha, .5 * wall * veins * smoothstep(.15, .9, wallAcross) * uFroth);
  }
  col *= 1. - .12 * (1. - smoothstep(0., .045, inside)) * inWater * (1. - .7 * thinning);   // 水際は少し暗く縁どられる
  col += uLight * .07 * (1. - smoothstep(0., .12, inside)) * inWater * uGain * (1. - wall);
  foamAlpha *= 1. - .75 * alpha * (1. - inWater);   // 砂に残った泡は、エビの体をほとんど隠さない
  col = mix(col, uFoam * foamTone, foamAlpha);

  float vignette = 1. - smoothstep(.3, 1.3, length((uv - .5) * vec2(1.1, 1.)));
  col *= mix(.94, 1., vignette);
  col += (hash(gl_FragCoord.xy + t) - .5) * .012;
  gl_FragColor = vec4(col, 1.);
}
`;
