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

  // なければGoogle Fonts CDNから取得
  console.log('Fetching font from Google Fonts...');
  const fontUrl =
    'https://fonts.gstatic.com/s/notosansjp/v53/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFJEk757Y0rw_qMHVdbR2L8Y9QTJ1LwkRmR5GprQAe-T30nNJNY0.0.woff2';

  const fontResponse = await fetch(fontUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!fontResponse.ok) {
    throw new Error(`Failed to fetch font: ${fontResponse.status}`);
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

const createOgImage = (
  nenType: NenType | null,
  info: NenTypeInfo | null,
): Parameters<typeof satori>[0] => {
  const isDefault = !nenType || !info;
  const color = info?.color ?? '#6366f1';
  const title = isDefault
    ? '念系統診断'
    : `念系統診断の結果は...`;
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
        background: `linear-gradient(135deg, #1e293b 0%, #0f172a 50%, ${color}22 100%)`,
        fontFamily: 'Noto Sans JP',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '60px',
            },
            children: [
              {
                type: 'img',
                props: {
                  src: `data:image/svg+xml,${encodeURIComponent(createCupSvg(nenType ?? 'enhancement', color))}`,
                  width: 200,
                  height: 220,
                  style: {},
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: '36px',
                          color: '#94a3b8',
                          marginBottom: '16px',
                        },
                        children: title,
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: isDefault ? '48px' : '72px',
                          fontWeight: 'bold',
                          color: color,
                          marginBottom: '20px',
                          textShadow: `0 0 40px ${color}66`,
                        },
                        children: subtitle,
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: '28px',
                          color: '#64748b',
                          borderLeft: `4px solid ${color}`,
                          paddingLeft: '16px',
                        },
                        children: description,
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              bottom: '30px',
              fontSize: '24px',
              color: '#475569',
            },
            children: 'nen-diagnosis',
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
