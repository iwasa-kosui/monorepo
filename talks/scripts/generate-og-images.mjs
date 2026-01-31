import satori from 'satori';
import sharp from 'sharp';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const talksRoot = dirname(__dirname);
const distDir = join(talksRoot, 'dist');

const WIDTH = 1200;
const HEIGHT = 630;

/**
 * Fetch Noto Sans JP font from Google Fonts
 */
async function loadFont() {
  const cssResponse = await fetch(
    'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700',
    {
      headers: {
        'User-Agent': 'Safari/534.30',
      },
    },
  );
  const css = await cssResponse.text();

  const fontUrlMatch =
    css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.(?:ttf|otf)[^)]*)\)/) ||
    css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
  if (!fontUrlMatch) {
    throw new Error('Failed to extract font URL from Google Fonts CSS');
  }

  const fontResponse = await fetch(fontUrlMatch[1]);
  return await fontResponse.arrayBuffer();
}

/**
 * Generate OGP image for a presentation
 */
async function generateOgImage(title, fontData) {
  const element = {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #F8F6F1 0%, #F0EEE9 100%)',
        position: 'relative',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: -50,
              right: -50,
              width: 400,
              height: 360,
              borderRadius: '50%',
              background: '#D49A82',
              opacity: 0.15,
            },
          },
        },
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              bottom: -30,
              left: -50,
              width: 300,
              height: 280,
              borderRadius: '50%',
              background: '#D4C4A8',
              opacity: 0.2,
            },
          },
        },
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              bottom: 100,
              right: 100,
              width: 200,
              height: 180,
              borderRadius: '50%',
              background: '#8FA88B',
              opacity: 0.12,
            },
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 80px',
              textAlign: 'center',
            },
            children: {
              type: 'div',
              props: {
                style: {
                  fontSize: 56,
                  fontWeight: 700,
                  color: '#5A5450',
                  lineHeight: 1.3,
                  maxWidth: 1000,
                  wordBreak: 'break-word',
                },
                children: title,
              },
            },
          },
        },
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              bottom: 50,
              fontSize: 24,
              color: '#7A746E',
            },
            children: 'kosui.me',
          },
        },
      ],
    },
  };

  const svg = await satori(element, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      {
        name: 'Noto Sans JP',
        data: fontData,
        weight: 700,
        style: 'normal',
      },
    ],
  });

  return await sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Parse YAML frontmatter from markdown
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  try {
    return yaml.load(match[1]);
  } catch {
    return null;
  }
}

/**
 * Find all presentations
 */
function findPresentations() {
  const presentations = [];
  const entries = readdirSync(talksRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d{4}$/.test(entry.name)) continue;

    const yearDir = join(talksRoot, entry.name);
    const talks = readdirSync(yearDir, { withFileTypes: true });

    for (const talk of talks) {
      if (!talk.isDirectory()) continue;

      const talkDir = join(yearDir, talk.name);
      const slidesPath = join(talkDir, 'slides.md');
      const metadataPath = join(talkDir, 'metadata.yaml');

      let title = talk.name;

      if (existsSync(slidesPath)) {
        const content = readFileSync(slidesPath, 'utf-8');
        const frontmatter = parseFrontmatter(content);
        if (frontmatter?.title) title = frontmatter.title;
      } else if (existsSync(metadataPath)) {
        try {
          const content = readFileSync(metadataPath, 'utf-8');
          const metadata = yaml.load(content);
          if (metadata?.title) title = metadata.title;
        } catch {
          // ignore
        }
      } else {
        continue;
      }

      presentations.push({
        year: entry.name,
        name: talk.name,
        title,
      });
    }
  }

  return presentations;
}

// Main
async function main() {
  console.log('Generating OGP images...');

  const presentations = findPresentations();
  console.log(`Found ${presentations.length} presentation(s)`);

  console.log('Loading font...');
  const fontData = await loadFont();

  for (const p of presentations) {
    const outDir = join(distDir, 'og', 'talks', p.year);
    mkdirSync(outDir, { recursive: true });

    const outPath = join(outDir, `${p.name}.png`);
    console.log(`  Generating ${p.year}/${p.name}.png`);

    const png = await generateOgImage(p.title, fontData);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(outPath, png);
  }

  console.log('OGP image generation complete!');
}

main().catch((err) => {
  console.error('Failed to generate OGP images:', err);
  process.exit(1);
});
