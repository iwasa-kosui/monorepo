import yaml from 'js-yaml';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const talksRoot = join(__dirname, '..', '..');

export interface TalkMetadata {
  date?: string;
  event?: string;
  description?: string;
  tags?: string[];
  duration?: string;
  eventUrl?: string;
}

export interface OgpData {
  title: string;
  description: string;
  imageUrl: string | null;
  url: string;
}

export type ExternalSlideType =
  | 'speakerdeck'
  | 'slideshare'
  | 'google-slides'
  | 'docswell';

export type SlideType = 'local' | ExternalSlideType;

interface BasePresentation {
  year: string;
  name: string;
  path: string;
  basePath: string;
  title: string;
  talk: TalkMetadata | null;
  ogpData: OgpData | null;
}

export interface LocalPresentation extends BasePresentation {
  slideType: 'local';
}

export interface ExternalPresentation extends BasePresentation {
  slideType: ExternalSlideType;
  external: {
    url: string;
    embedUrl: string;
  };
}

export type Presentation = LocalPresentation | ExternalPresentation;

export function isExternalPresentation(
  presentation: Presentation,
): presentation is ExternalPresentation {
  return presentation.slideType !== 'local';
}

interface Frontmatter {
  title?: string;
  talk?: TalkMetadata;
}

interface MetadataYaml {
  title?: string;
  talk?: TalkMetadata;
  external?: {
    type?: string;
    url?: string;
    embedUrl?: string;
  };
}

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): Frontmatter | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match?.[1]) return null;

  try {
    return yaml.load(match[1]) as Frontmatter;
  } catch {
    return null;
  }
}

/**
 * Extract talk metadata from slides.md
 */
function extractTalkMetadata(
  talkPath: string,
): { title: string | null; talk: TalkMetadata | null } | null {
  const slidesPath = join(talkPath, 'slides.md');
  if (!existsSync(slidesPath)) return null;

  const content = readFileSync(slidesPath, 'utf-8');
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) return null;

  return {
    title: frontmatter.title ?? null,
    talk: frontmatter.talk ?? null,
  };
}

const VALID_EXTERNAL_TYPES: ExternalSlideType[] = [
  'speakerdeck',
  'slideshare',
  'google-slides',
  'docswell',
];

function isValidExternalType(type: string): type is ExternalSlideType {
  return VALID_EXTERNAL_TYPES.includes(type as ExternalSlideType);
}

interface ParsedExternalMetadata {
  title: string | null;
  talk: TalkMetadata | null;
  external: {
    type: ExternalSlideType;
    url: string;
    embedUrl: string;
  };
}

interface OgpCacheEntry {
  data: OgpData | null;
  fetchedAt: number;
}

type OgpCache = Record<string, OgpCacheEntry>;

/**
 * Load OGP cache from .ogp-cache.json
 */
function loadOgpCache(): OgpCache {
  const cachePath = join(talksRoot, '.ogp-cache.json');
  if (!existsSync(cachePath)) return {};
  try {
    return JSON.parse(readFileSync(cachePath, 'utf-8')) as OgpCache;
  } catch {
    return {};
  }
}

/**
 * Parse metadata.yaml for external slides
 */
function parseMetadataYaml(talkPath: string): ParsedExternalMetadata | null {
  const metadataPath = join(talkPath, 'metadata.yaml');
  if (!existsSync(metadataPath)) return null;

  try {
    const content = readFileSync(metadataPath, 'utf-8');
    const metadata = yaml.load(content) as MetadataYaml;
    if (!metadata) return null;

    if (
      !metadata.external?.type
      || !metadata.external?.url
      || !metadata.external?.embedUrl
      || !isValidExternalType(metadata.external.type)
    ) {
      return null;
    }

    return {
      title: metadata.title ?? null,
      talk: metadata.talk ?? null,
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
export function findPresentations(): Presentation[] {
  const presentations: Presentation[] = [];
  const entries = readdirSync(talksRoot, { withFileTypes: true });
  const ogpCache = loadOgpCache();

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
        const eventUrl = metadata?.talk?.eventUrl;
        const ogpData = eventUrl ? (ogpCache[eventUrl]?.data ?? null) : null;
        const localPresentation: LocalPresentation = {
          year: entry.name,
          name: talk.name,
          path: talkDir,
          basePath: `/${entry.name}/${talk.name}/`,
          title: metadata?.title ?? talk.name,
          talk: metadata?.talk ?? null,
          slideType: 'local',
          ogpData,
        };
        presentations.push(localPresentation);
      } else if (existsSync(metadataPath)) {
        // External slide (metadata.yaml exists without slides.md)
        const metadata = parseMetadataYaml(talkDir);
        if (metadata) {
          const eventUrl = metadata.talk?.eventUrl;
          const ogpData = eventUrl ? (ogpCache[eventUrl]?.data ?? null) : null;
          const externalPresentation: ExternalPresentation = {
            year: entry.name,
            name: talk.name,
            path: talkDir,
            basePath: `/${entry.name}/${talk.name}/`,
            title: metadata.title ?? talk.name,
            talk: metadata.talk ?? null,
            slideType: metadata.external.type,
            external: {
              url: metadata.external.url,
              embedUrl: metadata.external.embedUrl,
            },
            ogpData,
          };
          presentations.push(externalPresentation);
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
