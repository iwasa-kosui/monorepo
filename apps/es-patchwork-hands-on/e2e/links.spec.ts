import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';

import { distDir, htmlFiles, readDistFile } from './dist';

const decodeEntities = (value: string): string =>
  value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', '\'');

const decodePath = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const resolveFile = (pathname: string): string | undefined => {
  const path = decodePath(pathname).replace(/^\//, '');
  const lastSegment = path.split('/').pop() ?? '';
  const candidates = path === '' || path.endsWith('/')
    ? [`${path}index.html`]
    : lastSegment.includes('.')
    ? [path]
    : [`${path}.html`, `${path}/index.html`];
  return candidates.find((candidate) => existsSync(`${distDir}${candidate}`));
};

const idsOf = (html: string): Set<string> =>
  new Set([...html.matchAll(/\sid="([^"]*)"/g)].map((match) => decodeEntities(match[1] ?? '')));

test('内部リンクはすべて dist のファイルに解決し、アンカーは移動先に同じ id がある', () => {
  const failures: string[] = [];
  let checked = 0;
  let anchors = 0;
  for (const file of htmlFiles()) {
    const html = readDistFile(file);
    for (const match of html.matchAll(/\shref="(\/(?!\/)[^"]*)"/g)) {
      const href = decodeEntities(match[1] ?? '');
      const [beforeHash = '', hash] = href.split('#', 2);
      const pathname = beforeHash.split('?')[0] ?? '';
      checked += 1;
      const target = resolveFile(pathname);
      if (target === undefined) {
        failures.push(`${file}: ${href} は dist にファイルがありません`);
        continue;
      }
      if (hash === undefined || hash === '') continue;
      anchors += 1;
      if (!target.endsWith('.html')) {
        failures.push(`${file}: ${href} のアンカーは HTML 以外を指しています`);
        continue;
      }
      if (!idsOf(readDistFile(target)).has(decodePath(hash))) {
        failures.push(`${file}: ${href} の移動先 ${target} に id="${decodePath(hash)}" がありません`);
      }
    }
  }
  expect(checked).toBeGreaterThan(0);
  expect(anchors).toBeGreaterThan(0);
  expect(failures).toEqual([]);
});
