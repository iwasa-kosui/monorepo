import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const talksRoot = dirname(__dirname);
const distDir = join(talksRoot, "dist");
const templatesDir = join(__dirname, "templates");

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
        presentations.push({
          year: entry.name,
          name: talk.name,
          path: talkDir,
          basePath: `/${entry.name}/${talk.name}/`,
        });
      }
    }
  }

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
 * Generate index.html listing all presentations
 */
function generateIndexPage(presentations) {
  const indexTemplate = readFileSync(join(templatesDir, "index.html"), "utf-8");
  const cardTemplate = readFileSync(join(templatesDir, "presentation-card.html"), "utf-8");

  const listItems = presentations
    .map((p) =>
      cardTemplate
        .replace("{{BASE_PATH}}", p.basePath)
        .replace("{{YEAR}}", p.year)
        .replace("{{NAME}}", p.name)
    )
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
