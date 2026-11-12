import { describe, expect, it } from 'vitest';

import { blueskyFeedKindOf } from './blueskyFeedUri.ts';

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
