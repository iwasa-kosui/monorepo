import * as yaml from 'js-yaml';
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const kosuiMeRoot = dirname(__dirname);
const talksRoot = join(kosuiMeRoot, '..', '..', 'talks');
const distDir = join(kosuiMeRoot, 'dist', 'slides');
const siteUrl = 'https://kosui.me';

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  try {
    return yaml.load(match[1]);
  } catch {
    return null;
  }
}

function findLocalPresentations() {
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

      if (existsSync(slidesPath)) {
        const content = readFileSync(slidesPath, 'utf-8');
        const frontmatter = parseFrontmatter(content);

        presentations.push({
          year: entry.name,
          name: talk.name,
          path: talkDir,
          basePath: `/slides/${entry.name}/${talk.name}/`,
          title: frontmatter?.title || talk.name,
        });
      }
    }
  }

  return presentations;
}

function buildPresentation(presentation) {
  console.log(`Building ${presentation.year}/${presentation.name}...`);

  const slidesPath = `${presentation.year}/${presentation.name}/slides.md`;

  execSync(
    `pnpm exec slidev build ${slidesPath} --base ${presentation.basePath} --out dist`,
    {
      cwd: talksRoot,
      stdio: 'inherit',
    },
  );

  const srcDist = join(talksRoot, presentation.year, presentation.name, 'dist');
  const destDir = join(distDir, presentation.year, presentation.name);

  if (!existsSync(srcDist)) {
    console.error(`Build output not found: ${srcDist}`);
    process.exit(1);
  }

  mkdirSync(destDir, { recursive: true });
  cpSync(srcDist, destDir, { recursive: true });

  console.log(`Copied to ${destDir}`);

  addCanonicalLink(destDir, presentation);
}

// スライド単体のページは、同じ内容を載せたトークページと重複する。
// 検索エンジンにはトークページを正規の URL として伝える。
function addCanonicalLink(destDir, presentation) {
  const canonicalUrl = `${siteUrl}/talks/${presentation.year}/${presentation.name}`;
  const link = `<link rel="canonical" href="${canonicalUrl}">`;

  for (const fileName of ['index.html', '404.html']) {
    const htmlPath = join(destDir, fileName);
    if (!existsSync(htmlPath)) continue;

    const html = readFileSync(htmlPath, 'utf-8');
    if (html.includes('rel="canonical"')) continue;
    if (!html.includes('</head>')) {
      console.error(`</head> not found: ${htmlPath}`);
      process.exit(1);
    }

    writeFileSync(htmlPath, html.replace('</head>', `${link}</head>`));
    console.log(`Added canonical link to ${htmlPath}`);
  }
}

// Main
console.log('Building Slidev presentations...\n');

if (!existsSync(talksRoot)) {
  console.error(`Talks root not found: ${talksRoot}`);
  process.exit(1);
}

mkdirSync(distDir, { recursive: true });

const presentations = findLocalPresentations();
console.log(`Found ${presentations.length} local presentation(s):`);
presentations.forEach((p) => console.log(`  - ${p.year}/${p.name}`));
console.log('');

for (const presentation of presentations) {
  buildPresentation(presentation);
  console.log('');
}

console.log('Slidev build complete!');
