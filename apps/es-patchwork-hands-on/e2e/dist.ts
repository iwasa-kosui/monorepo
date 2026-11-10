import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { schedule } from '../src/schedule';

export const distDir = fileURLToPath(new URL('../dist/', import.meta.url));

export const htmlFiles = (): string[] => {
  if (!existsSync(distDir)) {
    throw new Error('dist がありません。先に pnpm build を実行してください');
  }
  return readdirSync(distDir, { recursive: true, encoding: 'utf8' }).filter((path) => path.endsWith('.html')).sort();
};

export const readDistFile = (path: string): string => readFileSync(`${distDir}${path}`, 'utf8');

const toUrlPath = (file: string): string => `/${file.replace(/index\.html$/, '')}`;

const chapterPagePattern = /^\/chapters\/([^/]+)\/(?:(\d+)\/)?$/;

export const chapterPagePaths = (): string[] => {
  const pages = htmlFiles()
    .filter((file) => file.endsWith('index.html'))
    .map(toUrlPath)
    .flatMap((path) => {
      const match = chapterPagePattern.exec(path);
      return match === null ? [] : [{ path, chapter: match[1] ?? '', number: Number(match[2] ?? 1) }];
    });
  const order = schedule.map((row) => row.id);
  const unknown = pages.filter((page) => !order.includes(page.chapter));
  if (unknown.length > 0) {
    throw new Error(`schedule.ts に無い章のページが dist にあります: ${unknown.map((page) => page.path).join(', ')}`);
  }
  return order.flatMap((chapter) =>
    pages.filter((page) => page.chapter === chapter).sort((a, b) => a.number - b.number).map((page) => page.path)
  );
};

export const fitCheckedPaths = (): string[] => ['/', ...chapterPagePaths()];
