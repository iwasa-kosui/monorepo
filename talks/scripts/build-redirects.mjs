import yaml from 'js-yaml';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const talksRoot = dirname(__dirname);
const distDir = join(talksRoot, 'dist');

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  try {
    return yaml.load(match[1]);
  } catch {
    return null;
  }
}

function findAllPresentations() {
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

      if (existsSync(slidesPath) || existsSync(metadataPath)) {
        presentations.push({
          year: entry.name,
          name: talk.name,
        });
      }
    }
  }

  return presentations;
}

// Main
console.log('Generating _redirects for talks.kosui.me -> kosui.me...\n');

mkdirSync(distDir, { recursive: true });

const presentations = findAllPresentations();
const rules = [];

// Redirect homepage
rules.push('/ https://kosui.me/talks/ 301');

// Redirect each talk detail page
for (const p of presentations) {
  rules.push(`/talks/${p.year}/${p.name}/* https://kosui.me/talks/${p.year}/${p.name}/:splat 301`);
  // Also redirect the old Slidev direct paths
  rules.push(`/${p.year}/${p.name}/* https://kosui.me/slides/${p.year}/${p.name}/:splat 301`);
}

// Redirect API endpoints
rules.push('/api/oembed/* https://kosui.me/api/oembed/:splat 301');

// Catch-all redirect
rules.push('/* https://kosui.me/talks/:splat 301');

const redirectsContent = rules.join('\n') + '\n';
writeFileSync(join(distDir, '_redirects'), redirectsContent);

console.log(`Generated _redirects with ${rules.length} rules`);
console.log(redirectsContent);
