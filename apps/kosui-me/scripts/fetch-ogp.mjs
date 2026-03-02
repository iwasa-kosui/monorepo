import yaml from 'js-yaml';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ogs from 'open-graph-scraper';

const __dirname = dirname(fileURLToPath(import.meta.url));
const kosuiMeRoot = dirname(__dirname);
const talksRoot = join(kosuiMeRoot, '..', '..', 'talks');
const cachePath = join(talksRoot, '.ogp-cache.json');

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  try {
    return yaml.load(match[1]);
  } catch {
    return null;
  }
}

function extractEventUrlFromSlides(talkPath) {
  const slidesPath = join(talkPath, 'slides.md');
  if (!existsSync(slidesPath)) return null;

  const content = readFileSync(slidesPath, 'utf-8');
  const frontmatter = parseFrontmatter(content);
  return frontmatter?.talk?.eventUrl ?? null;
}

function extractEventUrlFromMetadata(talkPath) {
  const metadataPath = join(talkPath, 'metadata.yaml');
  if (!existsSync(metadataPath)) return null;

  try {
    const content = readFileSync(metadataPath, 'utf-8');
    const metadata = yaml.load(content);
    return metadata?.talk?.eventUrl ?? null;
  } catch {
    return null;
  }
}

function findAllEventUrls() {
  const eventUrls = new Set();

  if (!existsSync(talksRoot)) {
    console.warn(`Talks root not found: ${talksRoot}`);
    return [];
  }

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

      let eventUrl = null;
      if (existsSync(slidesPath)) {
        eventUrl = extractEventUrlFromSlides(talkDir);
      } else if (existsSync(metadataPath)) {
        eventUrl = extractEventUrlFromMetadata(talkDir);
      }

      if (eventUrl) {
        eventUrls.add(eventUrl);
      }
    }
  }

  return Array.from(eventUrls);
}

function loadCache() {
  if (!existsSync(cachePath)) return {};
  try {
    return JSON.parse(readFileSync(cachePath, 'utf-8'));
  } catch {
    return {};
  }
}

async function fetchOgp(url) {
  try {
    const { result, error } = await ogs({ url, timeout: 10000 });
    if (error || !result.success) return null;

    return {
      title: result.ogTitle || result.dcTitle || '',
      description: result.ogDescription || result.dcDescription || '',
      imageUrl: result.ogImage?.[0]?.url || null,
      url,
    };
  } catch {
    return null;
  }
}

function isCacheValid(entry) {
  if (!entry || typeof entry.fetchedAt !== 'number') return false;
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

async function main() {
  console.log('Fetching OGP data for event URLs...\n');

  const eventUrls = findAllEventUrls();
  console.log(`Found ${eventUrls.length} event URL(s):`);
  eventUrls.forEach((url) => console.log(`  - ${url}`));
  console.log('');

  if (eventUrls.length === 0) {
    console.log('No event URLs to fetch.');
    return;
  }

  const cache = loadCache();
  let fetchedCount = 0;
  let cachedCount = 0;
  let failedCount = 0;

  for (const url of eventUrls) {
    const existing = cache[url];

    if (isCacheValid(existing)) {
      console.log(`[CACHED] ${url}`);
      cachedCount++;
      continue;
    }

    console.log(`[FETCH] ${url}`);
    const data = await fetchOgp(url);

    if (data) {
      cache[url] = {
        data,
        fetchedAt: Date.now(),
      };
      console.log(`  -> Title: ${data.title || '(no title)'}`);
      fetchedCount++;
    } else {
      cache[url] = {
        data: null,
        fetchedAt: Date.now(),
      };
      console.log(`  -> Failed to fetch OGP`);
      failedCount++;
    }
  }

  writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  console.log(`\nOGP cache updated: ${cachePath}`);
  console.log(`  Fetched: ${fetchedCount}, Cached: ${cachedCount}, Failed: ${failedCount}`);
}

main().catch(console.error);
