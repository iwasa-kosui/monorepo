import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { loadDefaultJapaneseParser } from 'budoux';
import satori from 'satori';
import sharp from 'sharp';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SatoriNode = any;

type PostMeta = {
  title: string;
  ogTitle?: string;
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
  sand: '#f3e4da',
  ink: '#1f2740',
  muted: '#4b526d',
  accent: '#c04a40',
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

const loadMdxFiles = (dir: string): PostMeta[] => {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mdx'));

  return files.flatMap((file) => {
    const content = fs.readFileSync(path.join(dir, file), 'utf-8');
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return [];

    const fm = frontmatterMatch[1];
    const title = fm.match(/^title:\s*(?:"(.+)"|'(.+)'|(.+))$/m)?.slice(1).find((v) => v != null) ?? '';
    const slug = fm.match(/^slug:\s*(?:"(.+)"|'(.+)'|(.+))$/m)?.slice(1).find((v) => v != null) ?? '';
    const ogTitle = fm
      .match(/^ogTitle:\s*(?:"(.+)"|'(.+)'|(.+))$/m)
      ?.slice(1)
      .find((v) => v != null)
      ?.replace(/\\n/g, '\n');
    const ogIcon = fm.match(/^ogIcon:\s*(?:"(.+)"|'(.+)'|(.+))$/m)?.slice(1).find((v) => v != null);
    const ogSvg = fm.match(/^ogSvg:\s*(?:"(.+)"|'(.+)'|(.+))$/m)?.slice(1).find((v) => v != null);

    return [{ title, ogTitle, slug, ogIcon, ogSvg }];
  });
};

const loadPosts = (): PostMeta[] => {
  return loadMdxFiles(path.join(process.cwd(), 'src', 'content', 'posts'));
};

const loadReports = (): PostMeta[] => {
  return loadMdxFiles(path.join(process.cwd(), 'src', 'content', 'reports'));
};

const getTitleFontSize = (title: string): number => {
  const len = [...title].length;
  if (len <= 20) return 60;
  if (len <= 35) return 50;
  if (len <= 50) return 44;
  return 38;
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

const loadCustomSvg = (ogSvg: string, size: number): SatoriNode | null => {
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
        width: `${size}px`,
        height: `${size}px`,
        flexShrink: 0,
      },
      children: {
        type: 'img',
        props: {
          src: `data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`,
          width: size,
          height: size,
          style: { width: `${size}px`, height: `${size}px` },
        },
      },
    },
  };
};

const loadShoreDataUrl = (): string => {
  const png = fs.readFileSync(path.join(process.cwd(), 'scripts', 'og-assets', 'shore.png'));
  return `data:image/png;base64,${png.toString('base64')}`;
};

const createFrame = (shore: string, children: SatoriNode[]): SatoriNode => ({
  type: 'div',
  props: {
    style: {
      width: '1200px',
      height: '630px',
      position: 'relative',
      display: 'flex',
      backgroundColor: COLORS.sand,
      fontFamily: 'Noto Sans JP',
    },
    children: [
      {
        type: 'img',
        props: {
          src: shore,
          width: 1200,
          height: 630,
          style: { position: 'absolute', top: 0, left: 0, width: '1200px', height: '630px' },
        },
      },
      ...children,
    ],
  },
});

const createBrandMark = (): SatoriNode => ({
  type: 'div',
  props: {
    style: {
      position: 'absolute',
      top: '56px',
      left: '64px',
      display: 'flex',
      fontSize: '36px',
      color: COLORS.ink,
      fontWeight: 700,
    },
    children: 'kosui.me',
  },
});

const createBodyBlock = (children: SatoriNode[]): SatoriNode => ({
  type: 'div',
  props: {
    style: {
      position: 'absolute',
      left: '64px',
      bottom: '64px',
      width: '620px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
    },
    children,
  },
});

const budouxParser = loadDefaultJapaneseParser();
const graphemeSegmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);
const WORD_JOINER = String.fromCharCode(0x2060);
const TITLE_BLOCK_WIDTH = 620;
const LEADING_PUNCTUATION = /^[:;,.!?、。，．：；！？)）」』】]*\s*/;

const estimateWidth = (text: string, fontSize: number): number =>
  [...text].reduce((sum, ch) => sum + (/[\x21-\x7e]/.test(ch) ? 0.62 : 1) * fontSize, 0);

const joinRun = (run: string, fontSize: number): string => {
  const graphemes = [...graphemeSegmenter.segment(run)].map((s) => s.segment);
  const overlong = estimateWidth(run, fontSize) > TITLE_BLOCK_WIDTH;
  const glue = overlong ? ZERO_WIDTH_SPACE : WORD_JOINER;
  return graphemes.reduce((acc, g, i) => {
    if (i === 0) return g;
    const sticky = !overlong && /^[A-Za-z0-9]$/.test(graphemes[i - 1]) && /^[A-Za-z0-9]$/.test(g);
    return acc + (sticky ? '' : glue) + g;
  }, '');
};

const splitPhrases = (line: string): string[] =>
  budouxParser.parse(line).reduce<string[]>((phrases, phrase) => {
    const lead = phrase.match(LEADING_PUNCTUATION)?.[0] ?? '';
    if (lead === '' || phrases.length === 0) return [...phrases, phrase];
    const rest = phrase.slice(lead.length);
    return [...phrases.slice(0, -1), phrases[phrases.length - 1] + lead, ...(rest === '' ? [] : [rest])];
  }, []);

const breakTitle = (title: string, fontSize: number): string =>
  title
    .split('\n')
    .map((line) =>
      splitPhrases(line)
        .map((phrase) =>
          phrase
            .split(/(\s+)/)
            .map((part, i) => (i % 2 === 1 ? part : joinRun(part, fontSize)))
            .join('')
        )
        .join(ZERO_WIDTH_SPACE)
    )
    .join('\n');

const createTitle = (title: string, maxFontSize = Number.POSITIVE_INFINITY): SatoriNode => {
  const fontSize = Math.min(getTitleFontSize(title), maxFontSize);
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        fontSize: `${fontSize}px`,
        fontWeight: 700,
        color: COLORS.ink,
        lineHeight: 1.4,
        textAlign: 'left',
        whiteSpace: 'pre-line',
      },
      children: breakTitle(title, fontSize),
    },
  };
};

const createOgImage = (post: PostMeta, shore: string): SatoriNode => {
  const visualNode = post.ogSvg ? loadCustomSvg(post.ogSvg, 160) : null;
  const badgeNode = post.ogIcon ? createIconBadge(post.ogIcon) : null;

  const bodyChildren: SatoriNode[] = [];
  if (visualNode) {
    bodyChildren.push({
      type: 'div',
      props: { style: { display: 'flex', marginBottom: '24px' }, children: visualNode },
    });
  } else if (badgeNode) {
    bodyChildren.push({
      type: 'div',
      props: { style: { display: 'flex', marginBottom: '20px' }, children: badgeNode },
    });
  }
  bodyChildren.push(createTitle(post.ogTitle ?? post.title, visualNode ? 48 : undefined));

  return createFrame(shore, [createBrandMark(), createBodyBlock(bodyChildren)]);
};

const createReportOgImage = (report: PostMeta, shore: string): SatoriNode =>
  createFrame(shore, [
    createBrandMark(),
    createBodyBlock([
      {
        type: 'div',
        props: {
          style: {
            display: 'flex',
            fontSize: '30px',
            fontWeight: 700,
            color: COLORS.accent,
            marginBottom: '12px',
          },
          children: '🤖 生成AIレポート:',
        },
      },
      createTitle(report.ogTitle ?? report.title),
    ]),
  ]);

const createDefaultOgImage = (shore: string): SatoriNode =>
  createFrame(shore, [
    createBodyBlock([
      {
        type: 'div',
        props: {
          style: { display: 'flex', fontSize: '72px', fontWeight: 700, color: COLORS.ink },
          children: 'kosui.me',
        },
      },
      {
        type: 'div',
        props: {
          style: { display: 'flex', fontSize: '26px', color: COLORS.muted, marginTop: '12px' },
          children: 'TypeScript, Node.js, Infrastructure',
        },
      },
    ]),
  ]);

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
  return sharp(pngData.asPng()).png({ palette: true, quality: 90, colors: 256, dither: 1.0, effort: 10 }).toBuffer();
};

const slugToFileName = (slug: string): string => slug.replace(/\//g, '-');

const main = async (): Promise<void> => {
  console.log('Loading font...');
  const font = await loadFont();
  const shore = loadShoreDataUrl();
  const posts = loadPosts();

  const outputDir = path.join(process.cwd(), 'public', 'og');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('Generating default.png...');
  const defaultPng = await generateImage(createDefaultOgImage(shore), font);
  fs.writeFileSync(path.join(outputDir, 'default.png'), defaultPng);

  for (const post of posts) {
    const fileName = `${slugToFileName(post.slug)}.png`;
    console.log(`Generating ${fileName}...`);
    const png = await generateImage(createOgImage(post, shore), font);
    fs.writeFileSync(path.join(outputDir, fileName), png);
  }

  const reports = loadReports();
  for (const report of reports) {
    const fileName = `${slugToFileName(report.slug)}.png`;
    console.log(`Generating report ${fileName}...`);
    const png = await generateImage(createReportOgImage(report, shore), font);
    fs.writeFileSync(path.join(outputDir, fileName), png);
  }

  console.log(`Done! Generated ${posts.length + reports.length + 1} OG images.`);
};

main().catch(console.error);
