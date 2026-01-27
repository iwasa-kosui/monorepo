import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const talksRoot = join(__dirname, "..", "..");

export interface TalkMetadata {
  date?: string;
  event?: string;
  description?: string;
  tags?: string[];
  duration?: string;
}

export interface Presentation {
  year: string;
  name: string;
  path: string;
  basePath: string;
  title: string;
  talk: TalkMetadata | null;
}

interface Frontmatter {
  title?: string;
  talk?: TalkMetadata;
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
  talkPath: string
): { title: string | null; talk: TalkMetadata | null } | null {
  const slidesPath = join(talkPath, "slides.md");
  if (!existsSync(slidesPath)) return null;

  const content = readFileSync(slidesPath, "utf-8");
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) return null;

  return {
    title: frontmatter.title ?? null,
    talk: frontmatter.talk ?? null,
  };
}

/**
 * Find all presentation directories (YYYY/name pattern)
 */
export function findPresentations(): Presentation[] {
  const presentations: Presentation[] = [];
  const entries = readdirSync(talksRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d{4}$/.test(entry.name)) continue;

    const yearDir = join(talksRoot, entry.name);
    const talks = readdirSync(yearDir, { withFileTypes: true });

    for (const talk of talks) {
      if (!talk.isDirectory()) continue;

      const talkDir = join(yearDir, talk.name);
      const slidesPath = join(talkDir, "slides.md");

      if (existsSync(slidesPath)) {
        const metadata = extractTalkMetadata(talkDir);
        presentations.push({
          year: entry.name,
          name: talk.name,
          path: talkDir,
          basePath: `/${entry.name}/${talk.name}/`,
          title: metadata?.title ?? talk.name,
          talk: metadata?.talk ?? null,
        });
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
