import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchBlueskyActorFeeds, fetchBlueskyActorLists, fetchBlueskySavedFeeds } from './blueskyFeedClient.ts';

const FEED = 'at://did:plc:gen/app.bsky.feed.generator/whats-hot';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const stubFetch = (response: Response) => {
  const fetchStub = vi.fn(async (_url: string, _init?: RequestInit) => response);
  vi.stubGlobal('fetch', fetchStub);
  return fetchStub;
};

const failure = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a failure');
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchBlueskySavedFeeds', () => {
  it('HTTP の失敗は status と message を持つエラーにする', async () => {
    stubFetch(json({ error: 'Bluesky timeline is disabled' }, 409));

    expect(await failure(fetchBlueskySavedFeeds())).toMatchObject({
      status: 409,
      message: 'Bluesky timeline is disabled',
    });
  });
});

const LIST = 'at://did:plc:own/app.bsky.graph.list/3k';

describe('fetchBlueskyActorFeeds と fetchBlueskyActorLists', () => {
  it('feeds と lists の応答を、どちらも items にそろえて返す', async () => {
    const item = { uri: FEED, kind: 'feed', pinned: false };
    const listItem = { uri: LIST, kind: 'list', pinned: false };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        json(url.includes('/feeds') ? { feeds: [item], cursor: 'n1' } : { lists: [listItem], cursor: null })
      ),
    );

    expect(await fetchBlueskyActorFeeds('did:plc:alice', 'a b')).toEqual({ items: [item], cursor: 'n1' });
    expect(await fetchBlueskyActorLists('alice.bsky.social')).toEqual({ items: [listItem], cursor: null });
  });
});
