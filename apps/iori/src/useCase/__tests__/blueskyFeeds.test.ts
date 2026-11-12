import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { BlueskyClientError } from '../../ports/blueskyClient.ts';
import type { BlueskyFeedReader } from '../../ports/blueskyFeedReader.ts';
import { ListBlueskyFeedPostsUseCase } from '../listBlueskyFeedPosts.ts';
import { ListBlueskySavedFeedsUseCase } from '../listBlueskySavedFeeds.ts';

const FEED = 'at://did:plc:gen/app.bsky.feed.generator/a';
const failure: BlueskyClientError = {
  type: 'BlueskyClientError',
  kind: 'http',
  message: 'getFeed failed: status 500',
  status: 500,
};

describe('ListBlueskySavedFeedsUseCase', () => {
  it('保存したフィードとリストを返す', async () => {
    const saved = { feeds: [{ uri: FEED, kind: 'feed', pinned: true, displayName: 'Hot' }] } as const;
    const listSavedFeeds = vi.fn<BlueskyFeedReader['listSavedFeeds']>(async () => RA.ok(saved));

    const result = await ListBlueskySavedFeedsUseCase.create({ reader: { listSavedFeeds } }).run();

    expect(result).toEqual({ ok: true, val: saved });
    expect(listSavedFeeds).toHaveBeenCalledOnce();
  });

  it('reader の失敗をそのまま返す', async () => {
    const useCase = ListBlueskySavedFeedsUseCase.create({ reader: { listSavedFeeds: async () => RA.err(failure) } });

    expect(await useCase.run()).toEqual({ ok: false, err: failure });
  });
});

describe('ListBlueskyFeedPostsUseCase', () => {
  it('uri と cursor を渡して投稿とカーソルを返す', async () => {
    const page = { items: [], cursor: 'next' };
    const getFeedPosts = vi.fn<BlueskyFeedReader['getFeedPosts']>(async () => RA.ok(page));

    const result = await ListBlueskyFeedPostsUseCase.create({ reader: { getFeedPosts } }).run({
      uri: FEED,
      cursor: 'abc',
    });

    expect(result).toEqual({ ok: true, val: page });
    expect(getFeedPosts).toHaveBeenCalledExactlyOnceWith({ uri: FEED, cursor: 'abc' });
  });

  it('reader の失敗をそのまま返す', async () => {
    const useCase = ListBlueskyFeedPostsUseCase.create({ reader: { getFeedPosts: async () => RA.err(failure) } });

    expect(await useCase.run({ uri: FEED, cursor: undefined })).toEqual({ ok: false, err: failure });
  });
});
