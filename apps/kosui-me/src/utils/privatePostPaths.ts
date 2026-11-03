import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const listMdxFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listMdxFiles(path);
    return entry.name.endsWith('.mdx') ? [path] : [];
  });

const extractFrontmatterLines = (source: string): string[] => {
  const lines = source.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return [];
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  return end === -1 ? [] : lines.slice(1, end);
};

const unquote = (value: string): string => value.trim().replace(/^(['"])(.*)\1$/, '$2');

export const listPrivatePostPaths = (postsDir: string): Set<string> => {
  const paths = new Set<string>();
  for (const file of listMdxFiles(postsDir)) {
    const frontmatter = extractFrontmatterLines(readFileSync(file, 'utf-8'));
    if (!frontmatter.some((line) => /^private:\s*true\s*$/.test(line))) continue;
    const slugLine = frontmatter.find((line) => /^slug:/.test(line));
    const slug = slugLine ? unquote(slugLine.replace(/^slug:/, '')) : '';
    if (slug === '') {
      throw new Error(`private な記事に slug がありません: ${file}`);
    }
    paths.add(`/${slug}`);
  }
  return paths;
};
