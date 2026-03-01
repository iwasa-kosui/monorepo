import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SatoriNode = any;

type PostMeta = {
  title: string;
  slug: string;
  ogIcon?: string;
  ogSvg?: string;
};

const OG_ICONS: Record<string, { label: string; bgColor: string; textColor: string }> = {
  typescript: { label: 'TS', bgColor: '#3178C6', textColor: '#FFFFFF' },
  go: { label: 'Go', bgColor: '#00ADD8', textColor: '#FFFFFF' },
  nodejs: { label: 'Node', bgColor: '#339933', textColor: '#FFFFFF' },
  react: { label: 'React', bgColor: '#61DAFB', textColor: '#20232A' },
  python: { label: 'Py', bgColor: '#3776AB', textColor: '#FFFFFF' },
  rust: { label: 'Rs', bgColor: '#DEA584', textColor: '#000000' },
  docker: { label: 'Docker', bgColor: '#2496ED', textColor: '#FFFFFF' },
  aws: { label: 'AWS', bgColor: '#FF9900', textColor: '#232F3E' },
  gcp: { label: 'GCP', bgColor: '#4285F4', textColor: '#FFFFFF' },
  infra: { label: 'Infra', bgColor: '#6C757D', textColor: '#FFFFFF' },
  math: { label: 'Math', bgColor: '#8B5CF6', textColor: '#FFFFFF' },
  isucon: { label: 'ISUCON', bgColor: '#E8614D', textColor: '#FFFFFF' },
};

const COLORS = {
  background: '#FFF5F3',
  accent: '#E8614D',
  card: '#FFFFFF',
  title: '#1A1A1A',
  subtitle: '#888888',
} as const;

const loadFont = async (): Promise<ArrayBuffer> => {
  const localFontPath = path.join(process.cwd(), 'scripts', 'fonts', 'NotoSansJP-Bold.ttf');

  if (fs.existsSync(localFontPath)) {
    console.log('Using local font file...');
    const fontBuffer = fs.readFileSync(localFontPath);
    return fontBuffer.buffer.slice(fontBuffer.byteOffset, fontBuffer.byteOffset + fontBuffer.byteLength);
  }

  console.log('Fetching font from Google Fonts API...');
  const cssUrl = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&display=swap';

  const cssResponse = await fetch(cssUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; rv:10.0) Gecko/20100101 Firefox/10.0',
    },
  });

  if (!cssResponse.ok) {
    throw new Error(`Failed to fetch font CSS: ${cssResponse.status}`);
  }

  const css = await cssResponse.text();
  const fontUrlMatch = css.match(/src:\s*url\(([^)]+)\)/);
  if (!fontUrlMatch) {
    throw new Error('Font URL not found in CSS response');
  }

  const fontUrl = fontUrlMatch[1];
  const fontResponse = await fetch(fontUrl);

  if (!fontResponse.ok) {
    throw new Error(`Failed to fetch font file: ${fontResponse.status}`);
  }

  const fontArrayBuffer = await fontResponse.arrayBuffer();

  const fontsDir = path.dirname(localFontPath);
  if (!fs.existsSync(fontsDir)) {
    fs.mkdirSync(fontsDir, { recursive: true });
  }
  fs.writeFileSync(localFontPath, Buffer.from(fontArrayBuffer));
  console.log('Font saved to local cache.');

  return fontArrayBuffer;
};

const loadPosts = (): PostMeta[] => {
  const postsDir = path.join(process.cwd(), 'src', 'content', 'posts');
  const files = fs.readdirSync(postsDir).filter((f) => f.endsWith('.mdx'));

  return files.flatMap((file) => {
    const content = fs.readFileSync(path.join(postsDir, file), 'utf-8');
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return [];

    const fm = frontmatterMatch[1];
    const title = fm.match(/^title:\s*"(.+)"$/m)?.[1] ?? '';
    const slug = fm.match(/^slug:\s*"(.+)"$/m)?.[1] ?? '';
    const ogIcon = fm.match(/^ogIcon:\s*"(.+)"$/m)?.[1];
    const ogSvg = fm.match(/^ogSvg:\s*"(.+)"$/m)?.[1];

    return [{ title, slug, ogIcon, ogSvg }];
  });
};

const getTitleFontSize = (title: string): number => {
  const len = title.length;
  if (len <= 20) return 64;
  if (len <= 35) return 56;
  if (len <= 50) return 48;
  return 42;
};

const createCornerSwirl = (position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'): SatoriNode => {
  const rotations: Record<string, string> = {
    'top-left': '0deg',
    'top-right': '90deg',
    'bottom-right': '180deg',
    'bottom-left': '270deg',
  };

  const positions: Record<string, Record<string, string | number>> = {
    'top-left': { top: 0, left: 0 },
    'top-right': { top: 0, right: 0 },
    'bottom-left': { bottom: 0, left: 0 },
    'bottom-right': { bottom: 0, right: 0 },
  };

  return {
    type: 'div',
    props: {
      style: {
        position: 'absolute',
        width: '120px',
        height: '120px',
        display: 'flex',
        ...positions[position],
      },
      children: {
        type: 'svg',
        props: {
          width: '120',
          height: '120',
          viewBox: '0 0 120 120',
          style: {
            transform: `rotate(${rotations[position]})`,
          },
          children: [
            {
              type: 'path',
              props: {
                d: 'M0,0 Q60,10 40,60 Q30,80 0,80',
                fill: 'none',
                stroke: COLORS.accent,
                strokeWidth: '2',
                opacity: '0.3',
              },
            },
            {
              type: 'path',
              props: {
                d: 'M0,0 Q40,20 30,50 Q20,70 0,60',
                fill: 'none',
                stroke: COLORS.accent,
                strokeWidth: '2',
                opacity: '0.2',
              },
            },
            {
              type: 'circle',
              props: {
                cx: '8',
                cy: '8',
                r: '3',
                fill: COLORS.accent,
                opacity: '0.4',
              },
            },
          ],
        },
      },
    },
  };
};

const createIconBadge = (ogIcon: string): SatoriNode | null => {
  const icon = OG_ICONS[ogIcon];
  if (!icon) return null;

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: icon.bgColor,
        color: icon.textColor,
        fontSize: '18px',
        fontWeight: 'bold',
        borderRadius: '8px',
        padding: '6px 16px',
        fontFamily: 'Noto Sans JP',
      },
      children: icon.label,
    },
  };
};

const createShrimpIcon = (size: number): SatoriNode => {
  // Pixel art shrimp - extracted from reference image (17x14 grid)
  const body: [number, number][] = [
    [4, 0],
    [5, 0],
    [6, 0],
    [3, 1],
    [7, 1],
    [8, 1],
    [9, 1],
    [3, 2],
    [10, 2],
    [3, 3],
    [5, 3],
    [11, 3],
    [4, 4],
    [5, 4],
    [6, 4],
    [12, 4],
    [5, 5],
    [7, 5],
    [13, 5],
    [5, 6],
    [6, 6],
    [7, 6],
    [8, 6],
    [14, 6],
    [6, 7],
    [7, 7],
    [8, 7],
    [9, 7],
    [15, 7],
    [3, 8],
    [4, 8],
    [7, 8],
    [8, 8],
    [9, 8],
    [15, 8],
    [5, 9],
    [6, 9],
    [7, 9],
    [8, 9],
    [9, 9],
    [15, 9],
    [4, 10],
    [6, 10],
    [7, 10],
    [8, 10],
    [9, 10],
    [16, 10],
    [0, 11],
    [1, 11],
    [5, 11],
    [6, 11],
    [7, 11],
    [8, 11],
    [16, 11],
    [1, 12],
    [2, 12],
    [3, 12],
    [4, 12],
    [5, 12],
    [6, 12],
    [16, 12],
    [0, 13],
    [1, 13],
    [2, 13],
  ];
  const eye: [number, number] = [6, 5];

  const children: SatoriNode[] = body.map(([x, y]) => ({
    type: 'rect',
    props: { x: String(x), y: String(y), width: '1', height: '1', fill: '#EE7B6F' },
  }));
  children.push({
    type: 'rect',
    props: { x: String(eye[0]), y: String(eye[1]), width: '1', height: '1', fill: '#3750B1' },
  });

  return {
    type: 'svg',
    props: {
      width: String(size),
      height: String(Math.round((size * 14) / 17)),
      viewBox: '0 0 17 14',
      children,
    },
  };
};

const loadCustomSvg = (ogSvg: string): SatoriNode | null => {
  const svgPath = path.join(process.cwd(), 'scripts', 'og-icons', `${ogSvg}.svg`);
  if (!fs.existsSync(svgPath)) {
    console.warn(`SVG file not found: ${svgPath}`);
    return null;
  }

  const svgContent = fs.readFileSync(svgPath, 'utf-8');

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '48px',
        height: '48px',
      },
      children: {
        type: 'img',
        props: {
          src: `data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`,
          width: 48,
          height: 48,
          style: { width: '48px', height: '48px' },
        },
      },
    },
  };
};

const createOgImage = (post: PostMeta): SatoriNode => {
  const fontSize = getTitleFontSize(post.title);

  let iconNode: SatoriNode | null = null;
  if (post.ogSvg) {
    iconNode = loadCustomSvg(post.ogSvg);
  }
  if (!iconNode && post.ogIcon) {
    iconNode = createIconBadge(post.ogIcon);
  }

  const cardChildren: SatoriNode[] = [
    {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          fontSize: `${fontSize}px`,
          fontWeight: 'bold',
          color: COLORS.title,
          lineHeight: 1.4,
          textAlign: 'center',
          justifyContent: 'center',
          flex: 1,
          alignItems: 'center',
          padding: '0 20px',
        },
        children: post.title,
      },
    },
  ];

  if (iconNode) {
    cardChildren.push({
      type: 'div',
      props: {
        style: {
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: '12px',
        },
        children: iconNode,
      },
    });
  }

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
        backgroundColor: COLORS.background,
        fontFamily: 'Noto Sans JP',
        position: 'relative',
      },
      children: [
        createCornerSwirl('top-right'),
        createCornerSwirl('bottom-left'),
        createCornerSwirl('bottom-right'),
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: '28px',
              left: '40px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            },
            children: [
              createShrimpIcon(64),
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '48px',
                    fontWeight: 'bold',
                    color: COLORS.accent,
                  },
                  children: 'kosui.me',
                },
              },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: COLORS.card,
              borderRadius: '16px',
              padding: '40px 50px',
              margin: '80px 60px 0 60px',
              width: '1080px',
              minHeight: '360px',
              maxHeight: '420px',
              boxShadow: '0 4px 24px rgba(0, 0, 0, 0.08)',
              justifyContent: 'center',
            },
            children: cardChildren,
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'flex-end',
              width: '1080px',
              marginTop: '16px',
              paddingRight: '8px',
            },
            children: {
              type: 'div',
              props: {
                style: {
                  fontSize: '18px',
                  color: COLORS.subtitle,
                },
                children: 'by kosui',
              },
            },
          },
        },
      ],
    },
  };
};

const createDefaultOgImage = (): SatoriNode => ({
  type: 'div',
  props: {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: COLORS.background,
      fontFamily: 'Noto Sans JP',
      position: 'relative',
    },
    children: [
      createCornerSwirl('top-right'),
      createCornerSwirl('bottom-left'),
      createCornerSwirl('bottom-right'),
      {
        type: 'div',
        props: {
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: COLORS.card,
            borderRadius: '16px',
            padding: '50px 60px',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.08)',
          },
          children: [
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  marginBottom: '12px',
                },
                children: createShrimpIcon(36),
              },
            },
            {
              type: 'div',
              props: {
                style: {
                  fontSize: '64px',
                  fontWeight: 'bold',
                  color: COLORS.accent,
                  marginBottom: '12px',
                },
                children: 'kosui.me',
              },
            },
            {
              type: 'div',
              props: {
                style: {
                  fontSize: '22px',
                  color: COLORS.subtitle,
                },
                children: 'TypeScript, Node.js, Infrastructure',
              },
            },
          ],
        },
      },
    ],
  },
});

const loadEmoji = async (segment: string): Promise<string> => {
  const codePoints = [...segment]
    .map((c) => c.codePointAt(0)!.toString(16))
    .join('-');

  const url = `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/${codePoints}.svg`;
  const response = await fetch(url);
  if (response.ok) {
    const svg = await response.text();
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }

  // Some emoji need only the first code point (without variation selectors)
  const baseCodePoint = segment.codePointAt(0)!.toString(16);
  const fallbackUrl = `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/${baseCodePoint}.svg`;
  const fallbackResponse = await fetch(fallbackUrl);
  if (fallbackResponse.ok) {
    const svg = await fallbackResponse.text();
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }

  return '';
};

const generateImage = async (element: SatoriNode, font: ArrayBuffer): Promise<Buffer> => {
  const svg = await satori(element, {
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
    loadAdditionalAsset: async (languageCode: string, segment: string) => {
      if (languageCode === 'emoji') {
        return loadEmoji(segment);
      }
      return '';
    },
  });

  const resvg = new Resvg(svg, {
    background: 'rgba(0, 0, 0, 0)',
    fitTo: { mode: 'width', value: 1200 },
  });

  const pngData = resvg.render();
  return pngData.asPng();
};

const slugToFileName = (slug: string): string => slug.replace(/\//g, '-');

const main = async (): Promise<void> => {
  console.log('Loading font...');
  const font = await loadFont();
  const posts = loadPosts();

  const outputDir = path.join(process.cwd(), 'public', 'og');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('Generating default.png...');
  const defaultPng = await generateImage(createDefaultOgImage(), font);
  fs.writeFileSync(path.join(outputDir, 'default.png'), defaultPng);

  for (const post of posts) {
    const fileName = `${slugToFileName(post.slug)}.png`;
    console.log(`Generating ${fileName}...`);
    const png = await generateImage(createOgImage(post), font);
    fs.writeFileSync(path.join(outputDir, fileName), png);
  }

  console.log(`Done! Generated ${posts.length + 1} OG images.`);
};

main().catch(console.error);
