import { describe, expect, it } from 'vitest';

import { toCanonicalPath } from './canonicalPath';

describe('toCanonicalPath', () => {
  it.each([
    ['/index.html', '/'],
    ['/about.html', '/about'],
    ['/themes/typescript.html', '/themes/typescript'],
    ['/books/index.html', '/books/'],
    ['/', '/'],
    ['/about', '/about'],
    ['/posts/2026/11/15/html-and-css', '/posts/2026/11/15/html-and-css'],
  ])('%s を %s にする', (pathname, expected) => {
    expect(toCanonicalPath(pathname)).toBe(expected);
  });
});
