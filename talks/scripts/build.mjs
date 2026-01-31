import yaml from 'js-yaml';
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const talksRoot = dirname(__dirname);
const distDir = join(talksRoot, 'dist');
const distAstroDir = join(talksRoot, 'dist-astro');

/**
 * Parse YAML frontmatter from markdown content
 * @param {string} content - Markdown file content
 * @returns {object | null} Parsed frontmatter object or null
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
 * Extract talk metadata from slides.md
 * @param {string} talkPath - Path to the talk directory
 * @returns {object | null} Talk metadata or null
 */
function extractTalkMetadata(talkPath) {
  const slidesPath = join(talkPath, 'slides.md');
  if (!existsSync(slidesPath)) return null;

  const content = readFileSync(slidesPath, 'utf-8');
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) return null;

  return {
    title: frontmatter.title || null,
    talk: frontmatter.talk || null,
  };
}

const VALID_EXTERNAL_TYPES = [
  'speakerdeck',
  'slideshare',
  'google-slides',
  'docswell',
];

/**
 * Parse metadata.yaml for external slides
 * @param {string} talkPath - Path to the talk directory
 * @returns {object | null} External slide metadata or null
 */
function parseMetadataYaml(talkPath) {
  const metadataPath = join(talkPath, 'metadata.yaml');
  if (!existsSync(metadataPath)) return null;

  try {
    const content = readFileSync(metadataPath, 'utf-8');
    const metadata = yaml.load(content);
    if (!metadata) return null;

    if (
      !metadata.external?.type
      || !metadata.external?.url
      || !metadata.external?.embedUrl
      || !VALID_EXTERNAL_TYPES.includes(metadata.external.type)
    ) {
      return null;
    }

    return {
      title: metadata.title || null,
      talk: metadata.talk || null,
      external: {
        type: metadata.external.type,
        url: metadata.external.url,
        embedUrl: metadata.external.embedUrl,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Find all presentation directories (YYYY/name pattern)
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

      if (existsSync(slidesPath)) {
        // Local slide (slides.md exists)
        const metadata = extractTalkMetadata(talkDir);
        presentations.push({
          year: entry.name,
          name: talk.name,
          path: talkDir,
          basePath: `/${entry.name}/${talk.name}/`,
          title: metadata?.title || talk.name,
          talk: metadata?.talk || null,
          slideType: 'local',
        });
      } else if (existsSync(metadataPath)) {
        // External slide (metadata.yaml exists without slides.md)
        const metadata = parseMetadataYaml(talkDir);
        if (metadata) {
          presentations.push({
            year: entry.name,
            name: talk.name,
            path: talkDir,
            basePath: `/${entry.name}/${talk.name}/`,
            title: metadata.title || talk.name,
            talk: metadata.talk || null,
            slideType: metadata.external.type,
            external: {
              url: metadata.external.url,
              embedUrl: metadata.external.embedUrl,
            },
          });
        }
      }
    }
  }

  // Sort by date (newest first), then by year/name for those without dates
  presentations.sort((a, b) => {
    const dateA = a.talk?.date ? new Date(a.talk.date) : null;
    const dateB = b.talk?.date ? new Date(b.talk.date) : null;

    if (dateA && dateB) {
      return dateB.getTime() - dateA.getTime();
    }
    if (dateA) return -1;
    if (dateB) return 1;

    // Fallback: sort by year (descending), then name
    if (a.year !== b.year) {
      return b.year.localeCompare(a.year);
    }
    return a.name.localeCompare(b.name);
  });

  return presentations;
}

/**
 * Build a single presentation
 */
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
}

/**
 * Build Astro index page
 */
function buildAstroIndex() {
  console.log('Building Astro index page...');

  execSync('pnpm exec astro build', {
    cwd: talksRoot,
    stdio: 'inherit',
  });

  if (!existsSync(distAstroDir)) {
    console.error(`Astro build output not found: ${distAstroDir}`);
    process.exit(1);
  }

  // Copy Astro output to dist
  cpSync(distAstroDir, distDir, { recursive: true });
  console.log(`Copied Astro output to ${distDir}`);

  // Clean up intermediate Astro output
  rmSync(distAstroDir, { recursive: true });
  console.log(`Cleaned up ${distAstroDir}`);
}

/**
 * Fetch OGP data for event URLs
 */
function fetchOgpData() {
  console.log('Fetching OGP data...');

  execSync('node scripts/fetch-ogp.mjs', {
    cwd: talksRoot,
    stdio: 'inherit',
  });
}

// Main
console.log('Starting talks build...\n');

// Clean dist
if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true });
}
mkdirSync(distDir, { recursive: true });

// Fetch OGP data first
fetchOgpData();
console.log('');

// Build Astro index page first
buildAstroIndex();
console.log('');

const presentations = findPresentations();
const localPresentations = presentations.filter((p) => p.slideType === 'local');
const externalPresentations = presentations.filter(
  (p) => p.slideType !== 'local',
);

console.log(`Found ${presentations.length} presentation(s):\n`);
console.log('Local slides:');
localPresentations.forEach((p) => console.log(`  - ${p.year}/${p.name}`));
if (externalPresentations.length > 0) {
  console.log('\nExternal slides (will be skipped in Slidev build):');
  externalPresentations.forEach((p) => console.log(`  - ${p.year}/${p.name} (${p.slideType})`));
}
console.log('');

// Build each local presentation (skip external slides)
for (const presentation of localPresentations) {
  buildPresentation(presentation);
  console.log('');
}

// Generate OGP images
console.log('Generating OGP images...');
execSync('node scripts/generate-og-images.mjs', {
  cwd: talksRoot,
  stdio: 'inherit',
});
console.log('');

console.log('\nBuild complete!');
