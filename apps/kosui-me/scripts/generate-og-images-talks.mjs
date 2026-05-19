import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const kosuiMeRoot = dirname(__dirname);
const talksRoot = join(kosuiMeRoot, '..', '..', 'talks');
const outputBaseDir = join(kosuiMeRoot, 'public', 'og', 'talks');

const WIDTH = 1280;
const HEIGHT = 720;

function findLocalPresentations() {
  const presentations = [];

  if (!existsSync(talksRoot)) {
    console.warn(`Talks root not found: ${talksRoot}`);
    return presentations;
  }

  for (const yearEntry of readdirSync(talksRoot, { withFileTypes: true })) {
    if (!yearEntry.isDirectory() || !/^\d{4}$/.test(yearEntry.name)) continue;

    const yearDir = join(talksRoot, yearEntry.name);
    for (const talkEntry of readdirSync(yearDir, { withFileTypes: true })) {
      if (!talkEntry.isDirectory()) continue;

      const talkDir = join(yearDir, talkEntry.name);
      if (!existsSync(join(talkDir, 'slides.md'))) continue;

      presentations.push({ year: yearEntry.name, name: talkEntry.name });
    }
  }

  return presentations;
}

function exportFirstSlide(presentation, workDir) {
  const slidesRelPath = `${presentation.year}/${presentation.name}/slides.md`;

  execSync(
    `pnpm exec slidev export ${slidesRelPath} --format png --range 1 --output ${workDir}`,
    { cwd: talksRoot, stdio: 'inherit' },
  );

  const pngPath = join(workDir, '1.png');
  if (!existsSync(pngPath)) {
    throw new Error(`Exported PNG not found: ${pngPath}`);
  }
  return pngPath;
}

async function main() {
  console.log('Generating Talk OGP images from slide 1...');

  const presentations = findLocalPresentations();
  console.log(`Found ${presentations.length} local presentation(s)`);

  for (const p of presentations) {
    const outDir = join(outputBaseDir, p.year);
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, `${p.name}.png`);

    const workDir = mkdtempSync(join(tmpdir(), `slidev-og-${p.year}-${p.name}-`));
    try {
      console.log(`\n→ Exporting ${p.year}/${p.name}`);
      const pngPath = exportFirstSlide(p, workDir);

      await sharp(pngPath)
        .resize(WIDTH, HEIGHT, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .png()
        .toFile(outPath);

      console.log(`  Wrote ${outPath}`);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  }

  console.log('\nTalk OGP image generation complete!');
}

main().catch((err) => {
  console.error('Failed to generate OGP images:', err);
  process.exit(1);
});
