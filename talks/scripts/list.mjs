import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const talksRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function listTalks() {
  const talks = [];
  const entries = readdirSync(talksRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d{4}$/.test(entry.name)) continue;

    const yearDir = join(talksRoot, entry.name);
    for (const talk of readdirSync(yearDir, { withFileTypes: true })) {
      if (!talk.isDirectory()) continue;

      const talkDir = join(yearDir, talk.name);
      if (existsSync(join(talkDir, 'slides.md'))) {
        talks.push({ id: `${entry.name}/${talk.name}`, type: 'local' });
      } else if (existsSync(join(talkDir, 'metadata.yaml'))) {
        talks.push({ id: `${entry.name}/${talk.name}`, type: 'external' });
      }
    }
  }

  return talks.sort((a, b) => b.id.localeCompare(a.id));
}

function listThemes() {
  const themesDir = join(talksRoot, 'themes');
  if (!existsSync(themesDir)) return [];

  return readdirSync(themesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(themesDir, d.name, 'example.md')))
    .map((d) => d.name)
    .sort();
}

const talks = listTalks();
const themes = listThemes();

console.log(`Talks (${talks.length}):`);
for (const { id, type } of talks) {
  console.log(`  ${id}${type === 'external' ? ' (external)' : ''}`);
}

console.log(`\nThemes (${themes.length}):`);
for (const name of themes) {
  console.log(`  ${name}`);
}

console.log('\nUsage:');
console.log('  pnpm --filter talks dev <year>/<name>');
console.log('  pnpm --filter talks dev:theme <theme>');
console.log('  pnpm --filter talks export <year>/<name>');
