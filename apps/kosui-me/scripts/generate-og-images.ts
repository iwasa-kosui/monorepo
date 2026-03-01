import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SatoriNode = any;

type PostMeta = {
  title: string;
  slug: string;
};

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

    return [{ title, slug }];
  });
};

const createOgImage = (title: string): SatoriNode => ({
  type: 'div',
  props: {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '60px 80px',
      background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
      fontFamily: 'Noto Sans JP',
    },
    children: [
      {
        type: 'div',
        props: {
          style: {
            fontSize: title.length > 40 ? '42px' : '52px',
            fontWeight: 'bold',
            color: '#f1f5f9',
            lineHeight: 1.4,
            marginBottom: '40px',
          },
          children: title,
        },
      },
      {
        type: 'div',
        props: {
          style: {
            fontSize: '24px',
            color: '#94a3b8',
          },
          children: 'kosui.me',
        },
      },
    ],
  },
});

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
      background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
      fontFamily: 'Noto Sans JP',
    },
    children: [
      {
        type: 'div',
        props: {
          style: {
            fontSize: '72px',
            fontWeight: 'bold',
            color: '#f1f5f9',
            marginBottom: '16px',
          },
          children: 'kosui',
        },
      },
      {
        type: 'div',
        props: {
          style: {
            fontSize: '24px',
            color: '#94a3b8',
          },
          children: 'TypeScript, Node.js, Infrastructure',
        },
      },
    ],
  },
});

const generateImage = async (
  element: SatoriNode,
  font: ArrayBuffer,
): Promise<Buffer> => {
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

  // Default image
  console.log('Generating default.png...');
  const defaultPng = await generateImage(createDefaultOgImage(), font);
  fs.writeFileSync(path.join(outputDir, 'default.png'), defaultPng);

  // Per-post images
  for (const post of posts) {
    const fileName = `${slugToFileName(post.slug)}.png`;
    console.log(`Generating ${fileName}...`);
    const png = await generateImage(createOgImage(post.title), font);
    fs.writeFileSync(path.join(outputDir, fileName), png);
  }

  console.log(`Done! Generated ${posts.length + 1} OG images.`);
};

main().catch(console.error);
