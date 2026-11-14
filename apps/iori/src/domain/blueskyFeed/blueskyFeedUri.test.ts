import { describe, expect, it } from 'vitest';

import { blueskyFeedKindOf, parseBlueskyFeedUrl } from './blueskyFeedUri.ts';

describe('blueskyFeedKindOf', () => {
  it('app.bsky.feed.generator の URI を feed にする', () => {
    expect(blueskyFeedKindOf('at://did:plc:alice/app.bsky.feed.generator/whats-hot')).toBe('feed');
  });

  it('app.bsky.graph.list の URI を list にする', () => {
    expect(blueskyFeedKindOf('at://did:plc:alice/app.bsky.graph.list/3kabc')).toBe('list');
  });

  it('ほかの collection、at:// 以外、rkey が無い、余分なパスがある URI を undefined にする', () => {
    expect(blueskyFeedKindOf('at://did:plc:alice/app.bsky.feed.post/3kabc')).toBeUndefined();
    expect(blueskyFeedKindOf('https://example.com/app.bsky.feed.generator/x')).toBeUndefined();
    expect(blueskyFeedKindOf('at://did:plc:alice/app.bsky.feed.generator')).toBeUndefined();
    expect(blueskyFeedKindOf('at://did:plc:alice/app.bsky.feed.generator/')).toBeUndefined();
    expect(blueskyFeedKindOf('at://did:plc:alice/app.bsky.feed.generator/a/b')).toBeUndefined();
    expect(blueskyFeedKindOf('at:///app.bsky.feed.generator/a')).toBeUndefined();
    expect(blueskyFeedKindOf('')).toBeUndefined();
  });
});

describe('blueskyFeedKindOf の authority と rkey の検証', () => {
  it('authority が did でなければ undefined にする', () => {
    expect(blueskyFeedKindOf('at://alice.bsky.social/app.bsky.feed.generator/whats-hot')).toBeUndefined();
    expect(blueskyFeedKindOf('at://not-a-did/app.bsky.graph.list/3kabc')).toBeUndefined();
    expect(blueskyFeedKindOf('at://did:plc:/app.bsky.graph.list/3kabc')).toBeUndefined();
  });

  it('rkey が不正な文字を含む、または . と .. なら undefined にする', () => {
    expect(blueskyFeedKindOf('at://did:plc:alice/app.bsky.feed.generator/a b')).toBeUndefined();
    expect(blueskyFeedKindOf('at://did:plc:alice/app.bsky.feed.generator/a%2Fb')).toBeUndefined();
    expect(blueskyFeedKindOf('at://did:plc:alice/app.bsky.graph.list/.')).toBeUndefined();
    expect(blueskyFeedKindOf('at://did:plc:alice/app.bsky.graph.list/..')).toBeUndefined();
  });
});

describe('parseBlueskyFeedUrl', () => {
  it('フィードの URL を actor と rkey に分ける', () => {
    expect(parseBlueskyFeedUrl('https://bsky.app/profile/did:plc:alice/feed/whats-hot')).toEqual({
      actor: 'did:plc:alice',
      kind: 'feed',
      rkey: 'whats-hot',
    });
    expect(parseBlueskyFeedUrl('https://bsky.app/profile/alice.bsky.social/feed/aaaa')).toEqual({
      actor: 'alice.bsky.social',
      kind: 'feed',
      rkey: 'aaaa',
    });
  });

  it('リストの URL を actor と rkey に分ける', () => {
    expect(parseBlueskyFeedUrl('https://bsky.app/profile/alice.bsky.social/lists/3kabc')).toEqual({
      actor: 'alice.bsky.social',
      kind: 'list',
      rkey: '3kabc',
    });
  });

  it('前後の空白、末尾のスラッシュ、クエリとフラグメントを許す', () => {
    expect(parseBlueskyFeedUrl('  https://bsky.app/profile/did:plc:a/lists/3k/?x=1#y \n')).toEqual({
      actor: 'did:plc:a',
      kind: 'list',
      rkey: '3k',
    });
  });

  it('bsky.app の feed と lists 以外の URL を undefined にする', () => {
    expect(parseBlueskyFeedUrl('https://bsky.app/profile/alice.bsky.social/post/3k')).toBeUndefined();
    expect(parseBlueskyFeedUrl('https://bsky.app/profile/alice.bsky.social/list/3k')).toBeUndefined();
    expect(parseBlueskyFeedUrl('https://bsky.app/profile/alice.bsky.social/feed')).toBeUndefined();
    expect(parseBlueskyFeedUrl('https://bsky.app/profile/alice.bsky.social/feed/a/b')).toBeUndefined();
    expect(parseBlueskyFeedUrl('https://bsky.app/profile/alice.bsky.social')).toBeUndefined();
    expect(parseBlueskyFeedUrl('https://example.com/profile/alice.bsky.social/feed/a')).toBeUndefined();
    expect(parseBlueskyFeedUrl('https://bsky.app.example.com/profile/alice.bsky.social/feed/a')).toBeUndefined();
    expect(parseBlueskyFeedUrl('http://bsky.app/profile/alice.bsky.social/feed/a')).toBeUndefined();
    expect(parseBlueskyFeedUrl('at://did:plc:alice/app.bsky.feed.generator/a')).toBeUndefined();
    expect(parseBlueskyFeedUrl('')).toBeUndefined();
  });

  it('did でもハンドルでもない actor と、不正な rkey を undefined にする', () => {
    expect(parseBlueskyFeedUrl('https://bsky.app/profile/alice/feed/a')).toBeUndefined();
    expect(parseBlueskyFeedUrl('https://bsky.app/profile/did:/feed/a')).toBeUndefined();
    expect(parseBlueskyFeedUrl('https://bsky.app/profile/alice.bsky.social/feed/a%2Fb')).toBeUndefined();
    expect(parseBlueskyFeedUrl('https://bsky.app/profile/alice.bsky.social/feed/..')).toBeUndefined();
  });
});
