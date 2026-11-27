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

/** 文字を置く位置と、背景の画像 */
type Layout = Readonly<{
  /** 文字の左端（px） */
  textLeft: number;
  /** 文字の幅（px） */
  textWidth: number;
  /** 背景の画像（data URL） */
  shore: string;
}>;

/** 中央の正方形の内側に取る余白（px） */
const SQUARE_PADDING = 32;

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

const loadShoreDataUrl = (fileName: string): string => {
  const png = fs.readFileSync(path.join(process.cwd(), 'scripts', 'og-assets', fileName));
  return `data:image/png;base64,${png.toString('base64')}`;
};

/** 通常の配置。文字は左に寄せ、海と海老を右に置く */
const createStandardLayout = (): Layout => ({
  textLeft: 64,
  textWidth: 620,
  shore: loadShoreDataUrl('shore.png'),
});

/**
 * はてなブックマーク向けの配置。はてなブックマークは og:image の中央を正方形に切り抜くので、
 * 文字を中央の正方形（1 辺は画像の高さ）に収め、海と海老をその右外に置く。
 * はてなのクローラーにだけ返す（public/_worker.js）。
 */
const createHatenaLayout = (): Layout => ({
  textLeft: (WIDTH - HEIGHT) / 2 + SQUARE_PADDING,
  textWidth: HEIGHT - SQUARE_PADDING * 2,
  shore: loadShoreDataUrl('shore-hatena.png'),
});

const createFrame = (layout: Layout, children: SatoriNode[]): SatoriNode => ({
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
          src: layout.shore,
          width: WIDTH,
          height: HEIGHT,
          style: { position: 'absolute', top: 0, left: 0, width: `${WIDTH}px`, height: `${HEIGHT}px` },
        },
      },
      ...children,
    ],
  },
});

const createSiteName = (layout: Layout): SatoriNode => ({
  type: 'div',
  props: {
    style: {
      position: 'absolute',
      top: '60px',
      left: `${layout.textLeft}px`,
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

const createBodyBlock = (layout: Layout, children: SatoriNode[]): SatoriNode => ({
  type: 'div',
  props: {
    style: {
      position: 'absolute',
      left: `${layout.textLeft}px`,
      bottom: '64px',
      width: `${layout.textWidth}px`,
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

const joinRun = (run: string, fontSize: number, face: FontFace, width: number): string => {
  const graphemes = [...graphemeSegmenter.segment(run)].map((s) => s.segment);
  const overlong = estimateWidth(run, fontSize, face) > width;
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

const breakTitle = (title: string, fontSize: number, face: FontFace, width: number): string =>
  title
    .split('\n')
    .map((line) =>
      splitPhrases(line)
        .map((phrase) =>
          phrase
            .split(/(\s+)/)
            .map((part, i) => (i % 2 === 1 ? part : joinRun(part, fontSize, face, width)))
            .join('')
        )
        .join(ZERO_WIDTH_SPACE)
    )
    .join('\n');

const TITLE_FONT_SIZES = [68, 58, 50, 44, 38];
const TITLE_LINE_HEIGHT = 1.4;

const estimateLineCount = (title: string, fontSize: number, face: FontFace, width: number): number =>
  breakTitle(title, fontSize, face, width)
    .split('\n')
    .reduce((total, line) => {
      const units = line.split(/(?<=\u200b)/).flatMap((phrase) => phrase.split(/(?<=\s)/));
      const lines = units.reduce<string[]>((acc, unit) => {
        const current = acc[acc.length - 1];
        if (
          current !== undefined
          && estimateWidth((current + unit).replace(/[\s\u200b]+$/, ''), fontSize, face) <= width
        ) {
          return [...acc.slice(0, -1), current + unit];
        }
        return [...acc, unit];
      }, []);
      return total + lines.length;
    }, 0);

const getFittingFontSize = (title: string, face: FontFace, width: number, maxHeight: number): number => {
  const initial = getTitleFontSize(title);
  const candidates = [initial, ...TITLE_FONT_SIZES.filter((size) => size < initial)];
  const specifiedLines = title.includes('\n') ? title.split('\n').length : Infinity;
  return candidates.find((size) => {
    const lineCount = estimateLineCount(title, size, face, width);
    return lineCount * size * TITLE_LINE_HEIGHT <= maxHeight && lineCount <= specifiedLines;
  }) ?? candidates[candidates.length - 1];
};

const createTitle = (title: string, face: FontFace, width: number, maxHeight: number): SatoriNode => {
  const fontSize = getFittingFontSize(title, face, width, maxHeight);
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
      children: breakTitle(title, fontSize, face, width),
    },
  };
};

const createOgImage = (post: PostMeta, layout: Layout, face: FontFace): SatoriNode =>
  createFrame(layout, [
    createSiteName(layout),
    createBodyBlock(layout, [
      createMetaRow(post.date),
      createTitle(post.ogTitle ?? post.title, face, layout.textWidth, 376),
    ]),
  ]);

const createReportOgImage = (report: PostMeta, layout: Layout, face: FontFace): SatoriNode =>
  createFrame(layout, [
    createSiteName(layout),
    createBodyBlock(layout, [
      createMetaRow(report.date, '🤖 生成AIレポート'),
      createTitle(report.ogTitle ?? report.title, face, layout.textWidth, 376),
    ]),
  ]);

const createDefaultOgImage = (layout: Layout): SatoriNode =>
  createFrame(layout, [
    createBodyBlock(layout, [
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
  const posts = loadPosts();
  const reports = loadReports();

  // 通常の画像は public/og に、はてなブックマーク向けの画像は同じファイル名で public/og/hatena に置く
  const variants = [
    { label: 'standard', layout: createStandardLayout(), outputDir: path.join(process.cwd(), 'public', 'og') },
    { label: 'hatena', layout: createHatenaLayout(), outputDir: path.join(process.cwd(), 'public', 'og', 'hatena') },
  ];

  for (const { label, layout, outputDir } of variants) {
    fs.mkdirSync(outputDir, { recursive: true });

    console.log(`Generating default.png (${label})...`);
    const defaultPng = await generateImage(createDefaultOgImage(layout), fonts);
    fs.writeFileSync(path.join(outputDir, 'default.png'), defaultPng);

    for (const post of posts) {
      const fileName = `${slugToFileName(post.slug)}.png`;
      console.log(`Generating ${fileName} (${label})...`);
      const png = await generateImage(createOgImage(post, layout, face), fonts);
      fs.writeFileSync(path.join(outputDir, fileName), png);
    }

    for (const report of reports) {
      const fileName = `${slugToFileName(report.slug)}.png`;
      console.log(`Generating report ${fileName} (${label})...`);
      const png = await generateImage(createReportOgImage(report, layout, face), fonts);
      fs.writeFileSync(path.join(outputDir, fileName), png);
    }
  }

  console.log(`Done! Generated ${(posts.length + reports.length + 1) * variants.length} OG images.`);
};

main().catch(console.error);
