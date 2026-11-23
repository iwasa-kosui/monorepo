import { readdirSync, readFileSync } from 'node:fs';

const chaptersDir = new URL('../content/chapters/', import.meta.url);

export const chapterNames = (): string[] =>
  readdirSync(chaptersDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    .sort();

export const chapterPageFiles = (chapter: string): string[] =>
  readdirSync(new URL(`${chapter}/`, chaptersDir)).filter((name) => name.endsWith('.mdx')).sort();

export const readChapterText = (chapter: string): string =>
  chapterPageFiles(chapter).map((name) => readFileSync(new URL(`${chapter}/${name}`, chaptersDir), 'utf8')).join('');
