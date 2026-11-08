import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { distDir, htmlFiles, readDistFile } from './dist';

const checkFile = 'playground-check/index.html';

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

const usesPlaygroundRuntime = (html: string): boolean => html.includes('data-playground=') || loadsRuntimeScript(html);

test('確認用ページは実行基盤の JS を読み込み、noindex を付けている', () => {
  const html = readDistFile(checkFile);
  expect(loadsRuntimeScript(html)).toBe(true);
  expect(html).toContain('<meta name="robots" content="noindex">');
});

test('確認用ページ以外の HTML は実行基盤の JS を読み込まず、確認用ページへのリンクも持たない', () => {
  const others = htmlFiles().filter((file) => file !== checkFile);
  expect(others.length).toBeGreaterThan(10);
  const offenders = others.filter((file) => {
    const html = readDistFile(file);
    return usesPlaygroundRuntime(html) || html.includes('playground-check') || html.includes('name="robots"');
  });
  expect(offenders).toEqual([]);
});
