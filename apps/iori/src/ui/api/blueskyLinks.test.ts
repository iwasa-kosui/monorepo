import { describe, expect, it } from 'vitest';

import { blueskyActorPagePath, blueskyFeedPagePath, blueskyProfilePageHref, isExternalHref } from './blueskyLinks.ts';

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

describe('blueskyFeedPagePath', () => {
  it('at-uri をエンコードして /feeds の uri に付ける', () => {
    expect(blueskyFeedPagePath('at://did:plc:a/app.bsky.feed.generator/hot')).toBe(
      '/feeds?uri=at%3A%2F%2Fdid%3Aplc%3Aa%2Fapp.bsky.feed.generator%2Fhot',
    );
  });
});

describe('blueskyActorPagePath', () => {
  it('handle で iori のプロフィール画面のパスを返し、handle が無効なときは DID を使う', () => {
    expect(blueskyActorPagePath({ did: 'did:plc:a', handle: 'alice.bsky.social' })).toBe(
      '/bluesky/profile/alice.bsky.social',
    );
    expect(blueskyActorPagePath({ did: 'did:plc:a', handle: 'handle.invalid' })).toBe(
      '/bluesky/profile/did%3Aplc%3Aa',
    );
  });
});
