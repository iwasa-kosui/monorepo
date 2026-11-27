import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { loadDefaultJapaneseParser } from 'budoux';
import satori from 'satori';
import sharp from 'sharp';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SatoriNode = any;

type FontFace = {
  unitsPerEm: number;
  charToGlyph: (ch: string) => { index: number; advanceWidth?: number };
};

const require = createRequire(import.meta.url);
const opentype = createRequire(require.resolve('satori/package.json'))('@shuding/opentype.js') as {
  parse: (buffer: ArrayBuffer) => FontFace;
};

type PostMeta = {
  title: string;
  ogTitle?: string;
  slug: string;
  date: string;
};

const COLORS = {
  sand: '#f3e4da',
  ink: '#1f2740',
  muted: '#4b526d',
  accent: '#c04a40',
} as const;

type FontWeight = 500 | 700;

const WIDTH = 1200;
const HEIGHT = 630;

/**
 * はてなブックマークは og:image の中央を正方形に切り抜いて表示する。
 * 文字はすべて、中央の正方形（1 辺は画像の高さ）から余白を引いた幅に収める。
 */
const SQUARE_PADDING = 32;
const TEXT_LEFT = (WIDTH - HEIGHT) / 2 + SQUARE_PADDING;
const TEXT_WIDTH = HEIGHT - SQUARE_PADDING * 2;

const FONT_FILE_NAMES: Record<FontWeight, string> = {
  500: 'NotoSansJP-Medium.ttf',
  700: 'NotoSansJP-Bold.ttf',
};

const loadFont = async (weight: FontWeight): Promise<ArrayBuffer> => {
  const localFontPath = path.join(process.cwd(), 'scripts', 'fonts', FONT_FILE_NAMES[weight]);

  if (fs.existsSync(localFontPath)) {
    console.log(`Using local font file (${weight})...`);
    const fontBuffer = fs.readFileSync(localFontPath);
    return fontBuffer.buffer.slice(fontBuffer.byteOffset, fontBuffer.byteOffset + fontBuffer.byteLength);
  }

  console.log(`Fetching font (${weight}) from Google Fonts API...`);
  const cssUrl = `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@${weight}&display=swap`;

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
  console.log(`Font (${weight}) saved to local cache.`);

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
    const date = fm.match(/^date:\s*(?:"(.+)"|'(.+)'|(.+))$/m)?.slice(1).find((v) => v != null) ?? '';

    return [{ title, ogTitle, slug, date }];
  });
};

const loadPosts = (): PostMeta[] => {
  return loadMdxFiles(path.join(process.cwd(), 'src', 'content', 'posts'));
};

const loadReports = (): PostMeta[] => {
  return loadMdxFiles(path.join(process.cwd(), 'src', 'content', 'reports'));
};

const formatDate = (date: string): string => date.slice(0, 10).replaceAll('-', '.');

const getTitleFontSize = (title: string): number => {
  const len = [...title].length;
  if (len <= 20) return 68;
  if (len <= 35) return 58;
  if (len <= 50) return 50;
  return 44;
};

const loadShoreDataUrl = (): string => {
  const png = fs.readFileSync(path.join(process.cwd(), 'scripts', 'og-assets', 'shore.png'));
  return `data:image/png;base64,${png.toString('base64')}`;
};

const createFrame = (shore: string, children: SatoriNode[]): SatoriNode => ({
  type: 'div',
  props: {
    style: {
      width: `${WIDTH}px`,
      height: `${HEIGHT}px`,
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
          width: WIDTH,
          height: HEIGHT,
          style: { position: 'absolute', top: 0, left: 0, width: `${WIDTH}px`, height: `${HEIGHT}px` },
        },
      },
      ...children,
    ],
  },
});

const createSiteName = (): SatoriNode => ({
  type: 'div',
  props: {
    style: {
      position: 'absolute',
      top: '60px',
      left: `${TEXT_LEFT}px`,
      display: 'flex',
      fontSize: '28px',
      fontWeight: 500,
      color: COLORS.ink,
      letterSpacing: '0.06em',
    },
    children: 'kosui.me',
  },
});

const createMetaRow = (date: string, label?: string): SatoriNode => ({
  type: 'div',
  props: {
    style: {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: '20px',
    },
    children: [
      ...(label === undefined
        ? []
        : [
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                fontSize: '22px',
                fontWeight: 500,
                color: COLORS.accent,
                letterSpacing: '0.08em',
                marginRight: '20px',
              },
              children: label,
            },
          },
        ]),
      {
        type: 'div',
        props: {
          style: {
            display: 'flex',
            fontSize: '22px',
            fontWeight: 500,
            color: COLORS.muted,
            letterSpacing: '0.08em',
          },
          children: formatDate(date),
        },
      },
    ],
  },
});

const createBodyBlock = (children: SatoriNode[]): SatoriNode => ({
  type: 'div',
  props: {
    style: {
      position: 'absolute',
      left: `${TEXT_LEFT}px`,
      bottom: '64px',
      width: `${TEXT_WIDTH}px`,
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
const TITLE_BLOCK_WIDTH = TEXT_WIDTH;
const TITLE_LETTER_SPACING = 0.01;
const LEADING_PUNCTUATION = /^[:;,.!?、。，．：；！？)）」』】]*\s*/;

const estimateWidth = (text: string, fontSize: number, face: FontFace): number =>
  [...text].reduce((sum, ch) => {
    const letterSpacing = TITLE_LETTER_SPACING * fontSize;
    if (ch === ZERO_WIDTH_SPACE || ch === WORD_JOINER) return sum + letterSpacing;
    const glyph = face.charToGlyph(ch);
    const advance = glyph.index === 0 ? face.unitsPerEm : (glyph.advanceWidth ?? face.unitsPerEm);
    return sum + (advance / face.unitsPerEm) * fontSize + letterSpacing;
  }, 0);

const joinRun = (run: string, fontSize: number, face: FontFace): string => {
  const graphemes = [...graphemeSegmenter.segment(run)].map((s) => s.segment);
  const overlong = estimateWidth(run, fontSize, face) > TITLE_BLOCK_WIDTH;
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

const breakTitle = (title: string, fontSize: number, face: FontFace): string =>
  title
    .split('\n')
    .map((line) =>
      splitPhrases(line)
        .map((phrase) =>
          phrase
            .split(/(\s+)/)
            .map((part, i) => (i % 2 === 1 ? part : joinRun(part, fontSize, face)))
            .join('')
        )
        .join(ZERO_WIDTH_SPACE)
    )
    .join('\n');

const TITLE_FONT_SIZES = [68, 58, 50, 44, 38];
const TITLE_LINE_HEIGHT = 1.4;

const estimateLineCount = (title: string, fontSize: number, face: FontFace): number =>
  breakTitle(title, fontSize, face)
    .split('\n')
    .reduce((total, line) => {
      const units = line.split(/(?<=\u200b)/).flatMap((phrase) => phrase.split(/(?<=\s)/));
      const lines = units.reduce<string[]>((acc, unit) => {
        const current = acc[acc.length - 1];
        if (
          current !== undefined
          && estimateWidth((current + unit).replace(/[\s\u200b]+$/, ''), fontSize, face) <= TITLE_BLOCK_WIDTH
        ) {
          return [...acc.slice(0, -1), current + unit];
        }
        return [...acc, unit];
      }, []);
      return total + lines.length;
    }, 0);

const getFittingFontSize = (title: string, face: FontFace, maxHeight: number): number => {
  const initial = getTitleFontSize(title);
  const candidates = [initial, ...TITLE_FONT_SIZES.filter((size) => size < initial)];
  const specifiedLines = title.includes('\n') ? title.split('\n').length : Infinity;
  return candidates.find((size) => {
    const lineCount = estimateLineCount(title, size, face);
    return lineCount * size * TITLE_LINE_HEIGHT <= maxHeight && lineCount <= specifiedLines;
  }) ?? candidates[candidates.length - 1];
};

const createTitle = (title: string, face: FontFace, maxHeight: number): SatoriNode => {
  const fontSize = getFittingFontSize(title, face, maxHeight);
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        fontSize: `${fontSize}px`,
        fontWeight: 700,
        color: COLORS.ink,
        lineHeight: TITLE_LINE_HEIGHT,
        letterSpacing: `${TITLE_LETTER_SPACING}em`,
        textAlign: 'left',
        whiteSpace: 'pre-line',
      },
      children: breakTitle(title, fontSize, face),
    },
  };
};

const createOgImage = (post: PostMeta, shore: string, face: FontFace): SatoriNode =>
  createFrame(shore, [
    createSiteName(),
    createBodyBlock([createMetaRow(post.date), createTitle(post.ogTitle ?? post.title, face, 376)]),
  ]);

const createReportOgImage = (report: PostMeta, shore: string, face: FontFace): SatoriNode =>
  createFrame(shore, [
    createSiteName(),
    createBodyBlock([
      createMetaRow(report.date, '🤖 生成AIレポート'),
      createTitle(report.ogTitle ?? report.title, face, 376),
    ]),
  ]);

const createDefaultOgImage = (shore: string): SatoriNode =>
  createFrame(shore, [
    createBodyBlock([
      {
        type: 'div',
        props: {
          style: {
            display: 'flex',
            fontSize: '88px',
            fontWeight: 700,
            color: COLORS.ink,
            letterSpacing: '0.01em',
          },
          children: 'kosui.me',
        },
      },
      {
        type: 'div',
        props: {
          style: {
            display: 'flex',
            fontSize: '24px',
            fontWeight: 500,
            color: COLORS.muted,
            letterSpacing: '0.06em',
            marginTop: '16px',
          },
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

type OgFont = { data: ArrayBuffer; weight: FontWeight };

const generateImage = async (element: SatoriNode, fonts: OgFont[]): Promise<Buffer> => {
  const svg = await satori(element, {
    width: WIDTH,
    height: HEIGHT,
    fonts: fonts.map(({ data, weight }) => ({
      name: 'Noto Sans JP',
      data,
      weight,
      style: 'normal' as const,
    })),
    loadAdditionalAsset: async (languageCode: string, segment: string) => {
      if (languageCode === 'emoji') {
        return loadEmoji(segment);
      }
      return '';
    },
  });

  const resvg = new Resvg(svg, {
    background: 'rgba(0, 0, 0, 0)',
    fitTo: { mode: 'width', value: WIDTH },
  });

  const pngData = resvg.render();
  return sharp(pngData.asPng()).png({ palette: true, quality: 90, colors: 256, dither: 1.0, effort: 10 }).toBuffer();
};

const slugToFileName = (slug: string): string => slug.replace(/\//g, '-');

const main = async (): Promise<void> => {
  console.log('Loading font...');
  const medium = await loadFont(500);
  const bold = await loadFont(700);
  const fonts: OgFont[] = [{ data: medium, weight: 500 }, { data: bold, weight: 700 }];
  const face = opentype.parse(bold);
  const shore = loadShoreDataUrl();
  const posts = loadPosts();

  const outputDir = path.join(process.cwd(), 'public', 'og');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('Generating default.png...');
  const defaultPng = await generateImage(createDefaultOgImage(shore), fonts);
  fs.writeFileSync(path.join(outputDir, 'default.png'), defaultPng);

  for (const post of posts) {
    const fileName = `${slugToFileName(post.slug)}.png`;
    console.log(`Generating ${fileName}...`);
    const png = await generateImage(createOgImage(post, shore, face), fonts);
    fs.writeFileSync(path.join(outputDir, fileName), png);
  }

  const reports = loadReports();
  for (const report of reports) {
    const fileName = `${slugToFileName(report.slug)}.png`;
    console.log(`Generating report ${fileName}...`);
    const png = await generateImage(createReportOgImage(report, shore, face), fonts);
    fs.writeFileSync(path.join(outputDir, fileName), png);
  }

  console.log(`Done! Generated ${posts.length + reports.length + 1} OG images.`);
};

main().catch(console.error);
