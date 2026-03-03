import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { OgImage } from "../src/lib/og.js";
import { createElement } from "react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

interface PostFrontmatter {
  title: string;
  date: string;
  description: string;
  tags: string[];
}

const FONT_CACHE_DIR = path.resolve(root, "node_modules/.cache/og-fonts");

// Google Fonts CSS API - use User-Agent that returns woff (supported by satori)
const GOOGLE_FONTS_CSS_URL =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&display=swap";

async function fetchFont(): Promise<ArrayBuffer> {
  const cacheFile = path.resolve(FONT_CACHE_DIR, "NotoSansJP-700.woff");

  if (fs.existsSync(cacheFile)) {
    const buf = fs.readFileSync(cacheFile);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }

  console.log("Fetching Noto Sans JP...");

  // Firefox 38 does NOT support woff2, so Google Fonts returns woff format
  const cssRes = await fetch(GOOGLE_FONTS_CSS_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 6.3; rv:38.0) Gecko/20100101 Firefox/38.0",
    },
  });
  const css = await cssRes.text();

  // Extract all font URLs and download the largest subset (Japanese)
  const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]!);
  if (urls.length === 0) {
    throw new Error(`Could not find font URLs. CSS:\n${css.slice(0, 500)}`);
  }

  // Download all subsets and concatenate won't work - just use the last one (typically the base Latin+JP)
  // Actually, for satori we need just one subset. Pick the first one.
  const fontRes = await fetch(urls[0]!);
  const fontData = await fontRes.arrayBuffer();

  fs.mkdirSync(FONT_CACHE_DIR, { recursive: true });
  fs.writeFileSync(cacheFile, Buffer.from(fontData));

  return fontData;
}

async function getPostsMetadata(): Promise<
  Array<{ slug: string } & PostFrontmatter>
> {
  const { glob } = await import("glob");
  const postsDir = path.resolve(root, "src/content/posts");
  const files = await glob("*.mdx", { cwd: postsDir });

  const posts: Array<{ slug: string } & PostFrontmatter> = [];

  for (const file of files) {
    const content = fs.readFileSync(path.resolve(postsDir, file), "utf-8");
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;

    const fm = fmMatch[1];
    const title = fm.match(/title:\s*"(.+)"/)?.[1] ?? "";
    const date = fm.match(/date:\s*"(.+)"/)?.[1] ?? "";
    const description = fm.match(/description:\s*"(.+)"/)?.[1] ?? "";
    const tagsMatch = fm.match(/tags:\s*\[(.+)\]/)?.[1] ?? "";
    const tags = tagsMatch
      .split(",")
      .map((t) => t.trim().replace(/"/g, ""))
      .filter(Boolean);

    posts.push({
      slug: file.replace(/\.mdx$/, ""),
      title,
      date,
      description,
      tags,
    });
  }

  return posts;
}

async function generateOgImages() {
  const fontData = await fetchFont();

  const posts = await getPostsMetadata();
  const outDir = path.resolve(root, "dist/og");
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Generating ${posts.length} OG images...`);

  for (const post of posts) {
    const element = createElement(OgImage, {
      title: post.title,
      date: post.date,
    });

    const svg = await satori(element, {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Noto Sans JP", data: fontData, weight: 400, style: "normal" as const },
      ],
    });

    const resvg = new Resvg(svg);
    const png = resvg.render().asPng();
    fs.writeFileSync(path.resolve(outDir, `${post.slug}.png`), png);
    console.log(`  Generated: ${post.slug}.png`);
  }

  // Also copy to dist/client/og for SSG output
  const clientOgDir = path.resolve(root, "dist/client/og");
  if (outDir !== clientOgDir) {
    fs.mkdirSync(clientOgDir, { recursive: true });
    for (const file of fs.readdirSync(outDir)) {
      fs.copyFileSync(
        path.resolve(outDir, file),
        path.resolve(clientOgDir, file),
      );
    }
  }

  console.log("OG image generation complete!");
}

generateOgImages().catch((err) => {
  console.error("OG image generation failed:", err);
  process.exit(1);
});
