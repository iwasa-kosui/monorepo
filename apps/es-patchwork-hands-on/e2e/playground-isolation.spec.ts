import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { distDir, htmlFiles, readDistFile } from './dist';

const checkFile = 'playground-check/index.html';

const embeddedPages = /^chapters\/chapter-[123]\/(?:\d+\/)?index\.html$/;

const markers = ['cm-editor', 'sql-wasm', 'sucrase'];

const referencedScripts = (html: string): string[] =>
  [...html.matchAll(/<(?:script|link)\b[^>]*?\s(?:src|href)="(\/[^"]+\.js)"/g)].map((match) => match[1] ?? '');

const importedFiles = (source: string): string[] =>
  [...source.matchAll(/(?:\bimport|\bfrom)\s*["'](\.{1,2}\/[^"']+\.js)["']/g)].map((match) => match[1] ?? '');

const scriptClosure = (html: string): Map<string, string> => {
  const files = new Map<string, string>();
  const visit = (path: string): void => {
    if (files.has(path) || !existsSync(`${distDir}${path.replace(/^\//, '')}`)) {
      return;
    }
    const source = readFileSync(`${distDir}${path.replace(/^\//, '')}`, 'utf8');
    files.set(path, source);
    for (const imported of importedFiles(source)) {
      visit(join(dirname(path), imported));
    }
  };
  for (const path of referencedScripts(html)) {
    visit(path);
  }
  return files;
};

const loadsRuntimeScript = (html: string): boolean =>
  [...scriptClosure(html).values()].some((source) => markers.some((marker) => source.includes(marker)));

const hasRuntimeMarkup = (html: string): boolean => html.includes('data-playground=') || html.includes('data-play=');

const usesPlaygroundRuntime = (html: string): boolean => hasRuntimeMarkup(html) || loadsRuntimeScript(html);

test('確認用ページは実行基盤の JS を読み込み、noindex を付けている', () => {
  const html = readDistFile(checkFile);
  expect(loadsRuntimeScript(html)).toBe(true);
  expect(html).toContain('<meta name="robots" content="noindex">');
});

test('確認用ページと第1章から第3章のページ以外の HTML は実行基盤の JS を読み込まず、確認用ページへのリンクも持たない', () => {
  const others = htmlFiles().filter((file) =>
    file !== checkFile && !embeddedPages.test(file) && !file.startsWith('play/')
  );
  expect(others.length).toBeGreaterThan(10);
  expect(others).toContain('chapters/intro/index.html');
  expect(others).toContain('chapters/summary/index.html');
  expect(others).toContain('chapters/chapter-4/index.html');
  const offenders = others.filter((file) => {
    const html = readDistFile(file);
    return usesPlaygroundRuntime(html) || html.includes('playground-check') || html.includes('name="robots"');
  });
  expect(offenders).toEqual([]);
});

test('第1章から第3章では、実行欄を置いたページだけが実行基盤の JS を読み込む', () => {
  const pages = htmlFiles().filter((file) => embeddedPages.test(file));
  expect(pages.length).toBeGreaterThan(10);
  const mismatches = pages.filter((file) => {
    const html = readDistFile(file);
    return hasRuntimeMarkup(html) !== loadsRuntimeScript(html)
      || html.includes('playground-check')
      || html.includes('name="robots"');
  });
  expect(mismatches).toEqual([]);
  expect(pages.filter((file) => hasRuntimeMarkup(readDistFile(file))).sort()).toEqual([
    'chapters/chapter-1/3/index.html',
    'chapters/chapter-1/5/index.html',
    'chapters/chapter-1/index.html',
    'chapters/chapter-2/2/index.html',
    'chapters/chapter-2/4/index.html',
    'chapters/chapter-2/5/index.html',
    'chapters/chapter-3/index.html',
  ]);
});
