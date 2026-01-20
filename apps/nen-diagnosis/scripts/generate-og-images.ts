import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';

const NEN_TYPES = [
  'enhancement',
  'transmutation',
  'emission',
  'manipulation',
  'conjuration',
  'specialization',
] as const;

type NenType = (typeof NEN_TYPES)[number];

type NenTypeInfo = {
  id: NenType;
  japaneseName: string;
  waterDivinationResult: string;
  color: string;
};

const nenTypeInfoMap: Record<NenType, NenTypeInfo> = {
  enhancement: {
    id: 'enhancement',
    japaneseName: '強化系',
    waterDivinationResult: 'コップの水が溢れる',
    color: '#FFD700',
  },
  transmutation: {
    id: 'transmutation',
    japaneseName: '変化系',
    waterDivinationResult: '水の味が変わる',
    color: '#9370DB',
  },
  emission: {
    id: 'emission',
    japaneseName: '放出系',
    waterDivinationResult: '水の色が変わる',
    color: '#FF6347',
  },
  manipulation: {
    id: 'manipulation',
    japaneseName: '操作系',
    waterDivinationResult: '葉っぱが水面で動く',
    color: '#4169E1',
  },
  conjuration: {
    id: 'conjuration',
    japaneseName: '具現化系',
    waterDivinationResult: '水中に不純物が現れる',
    color: '#32CD32',
  },
  specialization: {
    id: 'specialization',
    japaneseName: '特質系',
    waterDivinationResult: '予測不能な変化が起こる',
    color: '#FF69B4',
  },
};

const loadFont = async (): Promise<ArrayBuffer> => {
  const localFontPath = path.join(process.cwd(), 'scripts', 'fonts', 'NotoSansJP-Bold.ttf');

  // ローカルにフォントファイルがあればそれを使用
  if (fs.existsSync(localFontPath)) {
    console.log('Using local font file...');
    const fontBuffer = fs.readFileSync(localFontPath);
    return fontBuffer.buffer.slice(fontBuffer.byteOffset, fontBuffer.byteOffset + fontBuffer.byteLength);
  }

  // Google Fonts APIからフォントURLを取得
  console.log('Fetching font from Google Fonts API...');
  const cssUrl = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&display=swap';

  const cssResponse = await fetch(cssUrl, {
    headers: {
      // TTF形式を取得するために古いブラウザのUser-Agentを指定
      // (Satoriはwoff2をサポートしていないため)
      'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; rv:10.0) Gecko/20100101 Firefox/10.0',
    },
  });

  if (!cssResponse.ok) {
    throw new Error(`Failed to fetch font CSS: ${cssResponse.status}`);
  }

  const css = await cssResponse.text();

  // CSSからフォントURLを抽出（最初のsrc: url(...)を取得）
  const fontUrlMatch = css.match(/src:\s*url\(([^)]+)\)/);
  if (!fontUrlMatch) {
    throw new Error('Font URL not found in CSS response');
  }

  const fontUrl = fontUrlMatch[1];
  console.log(`Font URL: ${fontUrl}`);

  const fontResponse = await fetch(fontUrl);

  if (!fontResponse.ok) {
    throw new Error(`Failed to fetch font file: ${fontResponse.status}`);
  }

  const fontArrayBuffer = await fontResponse.arrayBuffer();

  // 次回のためにローカルに保存
  const fontsDir = path.dirname(localFontPath);
  if (!fs.existsSync(fontsDir)) {
    fs.mkdirSync(fontsDir, { recursive: true });
  }
  fs.writeFileSync(localFontPath, Buffer.from(fontArrayBuffer));
  console.log('Font saved to local cache.');

  return fontArrayBuffer;
};

const createCupSvg = (nenType: NenType, color: string): string => {
  const waterColor = nenType === 'emission' ? color : 'rgba(100, 180, 255, 0.7)';

  let extraElements = '';

  if (nenType === 'enhancement') {
    // 溢れる水滴
    extraElements = `
      <circle cx="35" cy="25" r="4" fill="rgba(100, 180, 255, 0.8)" />
      <circle cx="105" cy="22" r="3" fill="rgba(100, 180, 255, 0.8)" />
      <circle cx="70" cy="18" r="3.5" fill="rgba(100, 180, 255, 0.8)" />
    `;
  } else if (nenType === 'conjuration') {
    // 不純物
    extraElements = `
      <circle cx="50" cy="70" r="5" fill="${color}" opacity="0.8" />
      <circle cx="75" cy="85" r="4" fill="${color}" opacity="0.7" />
      <circle cx="90" cy="65" r="4.5" fill="${color}" opacity="0.9" />
      <circle cx="60" cy="95" r="3.5" fill="${color}" opacity="0.6" />
    `;
  } else if (nenType === 'specialization') {
    // パルスエフェクト
    extraElements = `
      <circle cx="70" cy="70" r="25" fill="${color}" opacity="0.2" />
      <circle cx="70" cy="70" r="15" fill="${color}" opacity="0.4" />
    `;
  }

  return `
    <svg width="200" height="220" viewBox="0 0 140 160">
      <defs>
        <clipPath id="cupClip">
          <path d="M32 25 L28 105 Q28 118 70 118 Q112 118 112 105 L108 25 Z" />
        </clipPath>
        <linearGradient id="glowGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${color};stop-opacity:0.3" />
          <stop offset="100%" style="stop-color:${color};stop-opacity:0.1" />
        </linearGradient>
      </defs>

      <!-- グロー効果 -->
      <ellipse cx="70" cy="80" rx="60" ry="50" fill="url(#glowGradient)" />

      <!-- コップ本体 -->
      <path
        d="M30 20 L25 110 Q25 125 70 125 Q115 125 115 110 L110 20 Z"
        fill="rgba(200, 220, 255, 0.2)"
        stroke="rgba(255,255,255,0.5)"
        stroke-width="2"
      />

      <!-- 水 -->
      <g clip-path="url(#cupClip)">
        <rect x="28" y="35" width="84" height="85" fill="${waterColor}" />
        <ellipse cx="70" cy="38" rx="38" ry="6" fill="rgba(255,255,255,0.4)" />
        ${extraElements}
      </g>

      <!-- 葉っぱ -->
      <ellipse cx="70" cy="38" rx="14" ry="7" fill="#228B22" opacity="0.9" />
      <path d="M70 31 Q72 38 70 45" stroke="#1a6b1a" stroke-width="1.5" fill="none" />

      <!-- コップの光沢 -->
      <path d="M35 25 L33 100" stroke="rgba(255,255,255,0.4)" stroke-width="3" stroke-linecap="round" />
    </svg>
  `;
};

const createLargeCupSvg = (nenType: NenType, color: string): string => {
  const waterColor = nenType === 'emission' ? color : 'rgba(100, 180, 255, 0.7)';

  let extraElements = '';

  if (nenType === 'enhancement') {
    extraElements = `
      <circle cx="50" cy="35" r="8" fill="rgba(100, 180, 255, 0.8)" />
      <circle cx="150" cy="30" r="6" fill="rgba(100, 180, 255, 0.8)" />
      <circle cx="100" cy="25" r="7" fill="rgba(100, 180, 255, 0.8)" />
    `;
  } else if (nenType === 'conjuration') {
    extraElements = `
      <circle cx="70" cy="100" r="10" fill="${color}" opacity="0.8" />
      <circle cx="110" cy="130" r="8" fill="${color}" opacity="0.7" />
      <circle cx="140" cy="95" r="9" fill="${color}" opacity="0.9" />
      <circle cx="85" cy="145" r="7" fill="${color}" opacity="0.6" />
    `;
  } else if (nenType === 'specialization') {
    extraElements = `
      <circle cx="100" cy="105" r="45" fill="${color}" opacity="0.2" />
      <circle cx="100" cy="105" r="28" fill="${color}" opacity="0.4" />
    `;
  }

  return `
    <svg width="300" height="330" viewBox="0 0 200 240">
      <defs>
        <clipPath id="cupClipLarge">
          <path d="M45 40 L38 165 Q38 185 100 185 Q162 185 162 165 L155 40 Z" />
        </clipPath>
        <radialGradient id="glowGradientLarge" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style="stop-color:${color};stop-opacity:0.6" />
          <stop offset="100%" style="stop-color:${color};stop-opacity:0" />
        </radialGradient>
      </defs>

      <!-- グロー効果 -->
      <ellipse cx="100" cy="120" rx="90" ry="80" fill="url(#glowGradientLarge)" />

      <!-- コップ本体 -->
      <path
        d="M42 30 L35 170 Q35 195 100 195 Q165 195 165 170 L158 30 Z"
        fill="rgba(200, 220, 255, 0.25)"
        stroke="rgba(255,255,255,0.6)"
        stroke-width="3"
      />

      <!-- 水 -->
      <g clip-path="url(#cupClipLarge)">
        <rect x="38" y="55" width="124" height="130" fill="${waterColor}" />
        <ellipse cx="100" cy="58" rx="56" ry="10" fill="rgba(255,255,255,0.5)" />
        ${extraElements}
      </g>

      <!-- 葉っぱ -->
      <ellipse cx="100" cy="58" rx="20" ry="10" fill="#228B22" opacity="0.9" />
      <path d="M100 46 Q103 58 100 70" stroke="#1a6b1a" stroke-width="2" fill="none" />

      <!-- コップの光沢 -->
      <path d="M50 40 L46 155" stroke="rgba(255,255,255,0.5)" stroke-width="4" stroke-linecap="round" />
    </svg>
  `;
};

const createOgImage = (
  nenType: NenType | null,
  info: NenTypeInfo | null,
): Parameters<typeof satori>[0] => {
  const isDefault = !nenType || !info;
  const color = info?.color ?? '#6366f1';
  const title = isDefault ? '念系統診断' : '念系統診断の結果';
  const subtitle = info?.japaneseName ?? 'オーラ別性格診断';
  const description = info?.waterDivinationResult ?? 'あなたの念系統を診断します';

  return {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(180deg, #0f172a 0%, #1e293b 50%, ${color}40 100%)`,
        fontFamily: 'Noto Sans JP',
        position: 'relative',
      },
      children: [
        // コップを中央に大きく配置
        {
          type: 'img',
          props: {
            src: `data:image/svg+xml;base64,${
              Buffer.from(createLargeCupSvg(nenType ?? 'enhancement', color)).toString('base64')
            }`,
            width: 300,
            height: 330,
            style: {
              marginBottom: '20px',
            },
          },
        },
        // タイトル
        {
          type: 'div',
          props: {
            style: {
              fontSize: '32px',
              color: '#e2e8f0',
              marginBottom: '8px',
            },
            children: title,
          },
        },
        // サブタイトル（念系統名）
        {
          type: 'div',
          props: {
            style: {
              fontSize: isDefault ? '56px' : '72px',
              fontWeight: 'bold',
              color: '#ffffff',
              textShadow: `0 0 60px ${color}, 0 0 30px ${color}`,
              marginBottom: '12px',
            },
            children: subtitle,
          },
        },
        // 説明
        {
          type: 'div',
          props: {
            style: {
              fontSize: '24px',
              color: '#cbd5e1',
              padding: '8px 24px',
              borderRadius: '8px',
              background: 'rgba(0,0,0,0.3)',
            },
            children: description,
          },
        },
        // フッター
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              bottom: '24px',
              fontSize: '20px',
              color: '#64748b',
            },
            children: 'nen.kosui.me',
          },
        },
      ],
    },
  };
};

const generateImage = async (
  nenType: NenType | null,
  font: ArrayBuffer,
): Promise<Buffer> => {
  const info = nenType ? nenTypeInfoMap[nenType] : null;

  const svg = await satori(createOgImage(nenType, info), {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: 'Noto Sans JP',
        data: font,
        weight: 700,
        style: 'normal',
      },
    ],
  });

  const resvg = new Resvg(svg, {
    background: 'rgba(0, 0, 0, 0)',
    fitTo: {
      mode: 'width',
      value: 1200,
    },
  });

  const pngData = resvg.render();
  return pngData.asPng();
};

const main = async (): Promise<void> => {
  console.log('Loading font...');
  const font = await loadFont();

  const outputDir = path.join(process.cwd(), 'public', 'og');

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate default image
  console.log('Generating default.png...');
  const defaultPng = await generateImage(null, font);
  fs.writeFileSync(path.join(outputDir, 'default.png'), defaultPng);

  // Generate images for each nen type
  for (const nenType of NEN_TYPES) {
    console.log(`Generating ${nenType}.png...`);
    const png = await generateImage(nenType, font);
    fs.writeFileSync(path.join(outputDir, `${nenType}.png`), png);
  }

  console.log('Done! Generated 7 OGP images.');
};

main().catch(console.error);
