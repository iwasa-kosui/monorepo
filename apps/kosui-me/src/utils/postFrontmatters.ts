import * as yaml from 'js-yaml';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type PostFrontmatter = Readonly<{
  file: string;
  data: Readonly<Record<string, unknown>>;
}>;

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

/**
 * astro.config.mjs はコンテンツコレクションを読めないので、記事の frontmatter をファイルから直接読む。
 */
export const readPostFrontmatters = (postsDir: string): PostFrontmatter[] =>
  listMdxFiles(postsDir).flatMap((file) => {
    const data = extractFrontmatter(readFileSync(file, 'utf-8'));
    if (typeof data !== 'object' || data === null) return [];
    return [{ file, data: data as Record<string, unknown> }];
  });
