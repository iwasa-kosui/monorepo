import { describe, expect, it } from 'vitest';

import { blueskyProfilePageHref, isExternalHref } from './blueskyLinks.ts';

describe('blueskyProfilePageHref', () => {
  it('DID から bsky.app のプロフィールの URL を返す', () => {
    expect(blueskyProfilePageHref('did:plc:author')).toBe('https://bsky.app/profile/did:plc:author');
  });

  it('handle からも bsky.app のプロフィールの URL を返す', () => {
    expect(blueskyProfilePageHref('alice.bsky.social')).toBe('https://bsky.app/profile/alice.bsky.social');
  });

  it('DID でも handle でもない値のときは bsky.app のトップを返す', () => {
    expect(blueskyProfilePageHref('handle.invalid')).toBe('https://bsky.app');
  });
});

describe('isExternalHref', () => {
  it('http と https の URL は外部、サイト内のパスは外部ではない', () => {
    expect(isExternalHref('https://bsky.app/profile/did:plc:a')).toBe(true);
    expect(isExternalHref('http://example.com')).toBe(true);
    expect(isExternalHref('/bluesky/profile/did:plc:a')).toBe(false);
  });
});
