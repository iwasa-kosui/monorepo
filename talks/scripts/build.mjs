import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const talksRoot = dirname(__dirname);
const distDir = join(talksRoot, "dist");
const templatesDir = join(__dirname, "templates");

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
  const slidesPath = join(talkPath, "slides.md");
  if (!existsSync(slidesPath)) return null;

  const content = readFileSync(slidesPath, "utf-8");
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) return null;

  return {
    title: frontmatter.title || null,
    talk: frontmatter.talk || null,
  };
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Format date for display
 * @param {string} dateStr - ISO 8601 date string
 * @returns {string} Formatted date
 */
function formatDate(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
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
      const packageJsonPath = join(talkDir, "package.json");

      if (existsSync(packageJsonPath)) {
        const metadata = extractTalkMetadata(talkDir);
        presentations.push({
          year: entry.name,
          name: talk.name,
          path: talkDir,
          basePath: `/${entry.name}/${talk.name}/`,
          title: metadata?.title || talk.name,
          talk: metadata?.talk || null,
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

/**
 * Build a single presentation
 */
function buildPresentation(presentation) {
  console.log(`Building ${presentation.year}/${presentation.name}...`);

  execSync("pnpm run build", {
    cwd: presentation.path,
    stdio: "inherit",
  });

  const srcDist = join(presentation.path, "dist");
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
 * Generate HTML for a single presentation card
 * @param {object} presentation - Presentation data
 * @param {string} cardTemplate - Card HTML template
 * @returns {string} Generated HTML
 */
function generatePresentationCard(presentation, cardTemplate) {
  const talk = presentation.talk || {};

  // Date and event line
  let dateEventLine = "";
  if (talk.date || talk.event) {
    const dateStr = talk.date ? formatDate(talk.date) : "";
    const eventStr = talk.event ? escapeHtml(talk.event) : "";
    if (dateStr && eventStr) {
      dateEventLine = `<div class="text-xs text-terracotta dark:text-terracotta-light mb-1">${dateStr} / ${eventStr}</div>`;
    } else if (dateStr) {
      dateEventLine = `<div class="text-xs text-terracotta dark:text-terracotta-light mb-1">${dateStr}</div>`;
    } else if (eventStr) {
      dateEventLine = `<div class="text-xs text-terracotta dark:text-terracotta-light mb-1">${eventStr}</div>`;
    }
  } else {
    dateEventLine = `<div class="text-xs text-terracotta dark:text-terracotta-light mb-1">${presentation.year}</div>`;
  }

  // Description
  let descriptionHtml = "";
  if (talk.description) {
    descriptionHtml = `<p class="text-sm text-charcoal-light dark:text-gray-400 mt-2 line-clamp-2">${escapeHtml(talk.description.trim())}</p>`;
  }

  // Tags
  let tagsHtml = "";
  if (talk.tags && Array.isArray(talk.tags) && talk.tags.length > 0) {
    const tagItems = talk.tags
      .map(
        (tag) =>
          `<span class="inline-block px-2 py-0.5 text-xs rounded-full bg-sand dark:bg-gray-700 text-charcoal dark:text-gray-300">${escapeHtml(tag)}</span>`
      )
      .join("");
    tagsHtml = `<div class="flex flex-wrap gap-1.5 mt-3">${tagItems}</div>`;
  }

  // Duration
  let durationHtml = "";
  if (talk.duration) {
    durationHtml = `<div class="flex items-center gap-1 mt-2 text-xs text-charcoal-light dark:text-gray-400">
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
      ${escapeHtml(talk.duration)}
    </div>`;
  }

  return cardTemplate
    .replace("{{BASE_PATH}}", presentation.basePath)
    .replace("{{DATE_EVENT_LINE}}", dateEventLine)
    .replace("{{TITLE}}", escapeHtml(presentation.title))
    .replace("{{DESCRIPTION_HTML}}", descriptionHtml)
    .replace("{{TAGS_HTML}}", tagsHtml)
    .replace("{{DURATION_HTML}}", durationHtml);
}

/**
 * Generate index.html listing all presentations
 */
function generateIndexPage(presentations) {
  const indexTemplate = readFileSync(join(templatesDir, "index.html"), "utf-8");
  const cardTemplate = readFileSync(join(templatesDir, "presentation-card.html"), "utf-8");

  const listItems = presentations
    .map((p) => generatePresentationCard(p, cardTemplate))
    .join("\n");

  const html = indexTemplate.replace("{{PRESENTATION_LIST}}", listItems);

  writeFileSync(join(distDir, "index.html"), html);
  console.log("Generated index.html");
}


// Main
console.log("Starting talks build...\n");

// Clean dist
if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true });
}
mkdirSync(distDir, { recursive: true });

const presentations = findPresentations();
console.log(`Found ${presentations.length} presentation(s):\n`);
presentations.forEach((p) => console.log(`  - ${p.year}/${p.name}`));
console.log("");

// Build each presentation
for (const presentation of presentations) {
  buildPresentation(presentation);
  console.log("");
}

// Generate index page
generateIndexPage(presentations);

console.log("\nBuild complete!");
