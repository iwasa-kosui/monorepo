import { describe, expect, it } from 'vitest';

import {
  blueskyBlockUri,
  parseBlueskyBlockUri,
} from './blueskyModeration.ts';

describe('block の at-uri', () => {
  it('app.bsky.graph.block の uri だけを受け、repo と rkey に分ける', () => {
    const uri = 'at://did:plc:me/app.bsky.graph.block/3kblock';

    expect(blueskyBlockUri(uri)).toBe(uri);
    expect(parseBlueskyBlockUri(uri)).toEqual({ repo: 'did:plc:me', rkey: '3kblock' });
  });

  it('リストや投稿の uri、空の値は受けない', () => {
    expect(blueskyBlockUri('at://did:plc:me/app.bsky.graph.list/3klist')).toBeUndefined();
    expect(blueskyBlockUri('at://did:plc:me/app.bsky.feed.post/3k1')).toBeUndefined();
    expect(blueskyBlockUri('at://did:plc:me/app.bsky.graph.block/3k1/extra')).toBeUndefined();
    expect(blueskyBlockUri(null)).toBeUndefined();
    expect(blueskyBlockUri(undefined)).toBeUndefined();
    expect(parseBlueskyBlockUri('at://did:plc:me/app.bsky.graph.list/3klist')).toBeUndefined();
  });
});
