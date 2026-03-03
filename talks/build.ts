import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const talksDir = __dirname;
const blogDistDir = path.resolve(__dirname, "../apps/blog/dist/talks");

function getTalkDirs(): string[] {
  return fs
    .readdirSync(talksDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        fs.existsSync(path.join(talksDir, entry.name, "slides.md")),
    )
    .map((entry) => entry.name);
}

function buildTalks() {
  const talkDirs = getTalkDirs();

  if (talkDirs.length === 0) {
    console.log("No talks found to build.");
    return;
  }

  console.log(`Building ${talkDirs.length} talks...`);

  for (const dir of talkDirs) {
    const talkPath = path.join(talksDir, dir);
    const outDir = path.join(blogDistDir, dir);

    console.log(`  Building: ${dir}`);
    execSync(
      `npx slidev build --base /talks/${dir}/ --out ${outDir} ${path.join(talkPath, "slides.md")}`,
      {
        cwd: talksDir,
        stdio: "inherit",
      },
    );
  }

  console.log("All talks built successfully!");
}

buildTalks();
