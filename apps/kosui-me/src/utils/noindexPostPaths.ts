import yaml from 'js-yaml';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const listMdxFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listMdxFiles(path);
    return entry.name.endsWith('.mdx') ? [path] : [];
  });

const extractFrontmatter = (source: string): unknown => {
  const lines = source.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return undefined;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  return end === -1 ? undefined : yaml.load(lines.slice(1, end).join('\n'));
};

export const listNoindexPostPaths = (postsDir: string): Set<string> => {
  const paths = new Set<string>();
  for (const file of listMdxFiles(postsDir)) {
    const data = extractFrontmatter(readFileSync(file, 'utf-8'));
    if (typeof data !== 'object' || data === null) continue;
    const { private: isPrivate, draft, slug } = data as Record<string, unknown>;
    if (isPrivate !== true && draft !== true) continue;
    if (typeof slug !== 'string' || slug === '') {
      throw new Error(`noindex の記事に slug がありません: ${file}`);
    }
    paths.add(`/${slug}`);
  }
  return paths;
};
