import { describe, expect, it } from 'vitest';

import { resolveNextPath } from './signInNext.ts';

const ORIGIN = 'https://iori.test';

describe('resolveNextPath', () => {
  it('同じオリジンの /oauth/authorize はクエリ付きでそのまま返す', () => {
    const next = '/oauth/authorize?client_id=a&state=b';

    expect(resolveNextPath(next, ORIGIN)).toBe(next);
  });

  it.each([
    '//evil.example',
    '/\\evil.example',
    'https://evil.example/oauth/authorize',
    '/oauth/authorizeX',
    '/oauth/authorize/../x',
    '/',
    '/home',
  ])('%s は / にする', (next) => {
    expect(resolveNextPath(next, ORIGIN)).toBe('/');
  });

  it('next がなければ / にする', () => {
    expect(resolveNextPath(null, ORIGIN)).toBe('/');
  });
});
