import { describe, expect, it, vi } from 'vitest';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import type { BlueskyTimelinePage, Page } from '../api/mastodonClient.ts';
import type { HomeFeedPaging } from './homeFeed.ts';
import { fetchNewerBluesky, fetchNewerStatuses, MAX_REFRESH_PAGES, pagingAfterRefresh } from './homeFeedRefresh.ts';

const at = (second: number) => Date.UTC(2026, 10, 8, 12, 0, second);
const status = (id: string, second = 0, uri: string = `https://example.com/notes/${id}`) =>
  ({ id, uri, created_at: new Date(at(second)).toISOString() }) as Status;
const bluesky = (id: string, second: number, uri: string = `at://did:plc:x/app.bsky.feed.post/${id}`) =>
  ({ feedItemId: id, uri, indexedAt: at(second) }) as IoriBlueskyTimelineItemBody;
const statusPage = (items: readonly Status[], nextMaxId: string | undefined): Page<Status> => ({
  items,
  nextMaxId,
  prevMinId: undefined,
});
const blueskyPage = (items: readonly IoriBlueskyTimelineItemBody[], hasNext: boolean): BlueskyTimelinePage => {
  const last = items[items.length - 1];
  return {
    enabled: true,
    items,
    nextBefore: hasNext && last !== undefined ? last.indexedAt : null,
    nextBeforeId: hasNext && last !== undefined ? last.feedItemId : null,
  };
};

describe('fetchNewerStatuses', () => {
  it('手元の最新より新しいステータスを since_id で取得し、1ページに収まれば先頭に足す', async () => {
    const fetchPage = vi.fn().mockResolvedValue(statusPage([status('s4'), status('s3')], 's3'));

    const result = await fetchNewerStatuses(fetchPage, [status('s2'), status('s1')], 40);

    expect(fetchPage).toHaveBeenCalledWith({ sinceId: 's2' });
    expect(result).toEqual({ kind: 'merged', newer: [status('s4'), status('s3')] });
  });

  it('1ページに収まらないときは max_id で since_id まで遡る', async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce(statusPage([status('s5'), status('s4')], 's4'))
      .mockResolvedValueOnce(statusPage([status('s3')], 's3'));

    const result = await fetchNewerStatuses(fetchPage, [status('s2')], 2);

    expect(fetchPage).toHaveBeenNthCalledWith(2, { sinceId: 's2', maxId: 's4' });
    expect(result).toEqual({ kind: 'merged', newer: [status('s5'), status('s4'), status('s3')] });
  });

  it('遡りきれないほど新着が多いときは丸ごと置き換える', async () => {
    const fetchPage = vi.fn().mockImplementation(({ maxId }: { maxId?: string }) =>
      Promise.resolve(statusPage([status(`${maxId ?? 'top'}-a`), status(`${maxId ?? 'top'}-b`)], `${maxId ?? 'top'}-b`))
    );

    const result = await fetchNewerStatuses(fetchPage, [status('old')], 2);

    expect(fetchPage).toHaveBeenCalledTimes(MAX_REFRESH_PAGES);
    expect(result.kind).toBe('replaced');
  });

  it('手元が空なら最新のページで置き換える', async () => {
    const fetchPage = vi.fn().mockResolvedValue(statusPage([status('s1')], 's1'));

    expect(await fetchNewerStatuses(fetchPage, [], 40)).toEqual({
      kind: 'replaced',
      items: [status('s1')],
      cursor: 's1',
    });
  });
});

describe('fetchNewerBluesky', () => {
  it('手元のアイテムに行き当たるまでの新着を集める', async () => {
    const fetchPage = vi.fn().mockResolvedValue(
      blueskyPage([bluesky('b3', 30), bluesky('b2', 20), bluesky('b1', 10)], true),
    );

    const result = await fetchNewerBluesky(fetchPage, [bluesky('b2', 20), bluesky('b1', 10)]);

    expect(result).toEqual({ kind: 'merged', newer: [bluesky('b3', 30)] });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('1ページ目で行き当たらなければ次のページを辿る', async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce(blueskyPage([bluesky('b5', 50), bluesky('b4', 40)], true))
      .mockResolvedValueOnce(blueskyPage([bluesky('b3', 30), bluesky('b2', 20)], true));

    const result = await fetchNewerBluesky(fetchPage, [bluesky('b2', 20)]);

    expect(fetchPage).toHaveBeenNthCalledWith(2, { before: at(40), beforeId: 'b4' });
    expect(result).toEqual({ kind: 'merged', newer: [bluesky('b5', 50), bluesky('b4', 40), bluesky('b3', 30)] });
  });

  it('手元より古いアイテムに達したら、手元のアイテムが消えていても止まる', async () => {
    const fetchPage = vi.fn().mockResolvedValue(blueskyPage([bluesky('b3', 30), bluesky('b0', 5)], true));

    const result = await fetchNewerBluesky(fetchPage, [bluesky('b2', 20)]);

    expect(result).toEqual({ kind: 'merged', newer: [bluesky('b3', 30)] });
  });
});

describe('pagingAfterRefresh', () => {
  const prev: HomeFeedPaging = {
    statuses: [status('s2', 11), status('s1', 10)],
    nextMaxId: 's1',
    bluesky: { items: [bluesky('b1', 10)], cursor: { before: at(10), beforeId: 'b1' } },
  };

  it('新着を先頭に足し、続きを読むためのカーソルは手元のものを保つ', () => {
    const result = pagingAfterRefresh(
      prev,
      { kind: 'merged', newer: [status('s3', 30), status('s2', 11)] },
      { kind: 'merged', newer: [bluesky('b2', 20)] },
    );

    expect(result.paging.statuses.map((s) => s.id)).toEqual(['s3', 's2', 's1']);
    expect(result.paging.nextMaxId).toBe('s1');
    expect(result.paging.bluesky.items.map((item) => item.feedItemId)).toEqual(['b2', 'b1']);
    expect(result.paging.bluesky.cursor).toEqual(prev.bluesky.cursor);
    expect(result.newCount).toBe(2);
  });

  it('新着がなければ同じ配列を返す', () => {
    const result = pagingAfterRefresh(prev, { kind: 'merged', newer: [] }, { kind: 'merged', newer: [] });

    expect(result.paging.statuses).toBe(prev.statuses);
    expect(result.paging.bluesky.items).toBe(prev.bluesky.items);
    expect(result.newCount).toBe(0);
  });

  it('Bluesky の取得に失敗したときは手元の Bluesky を残す', () => {
    const result = pagingAfterRefresh(prev, { kind: 'merged', newer: [status('s3', 30)] }, undefined);

    expect(result.paging.bluesky).toBe(prev.bluesky);
    expect(result.newCount).toBe(1);
  });

  it('ブリッジの status と本物の Bluesky が同時に新着になったら 1 件と数える', () => {
    const postUri = 'at://did:plc:x/app.bsky.feed.post/real';

    const result = pagingAfterRefresh(
      prev,
      { kind: 'merged', newer: [status('bridged', 20, `https://bsky.brid.gy/convert/ap/${postUri}`)] },
      { kind: 'merged', newer: [bluesky('real', 21, postUri)] },
    );

    expect(result.newCount).toBe(1);
  });

  it('置き換えたときは件数を返さない', () => {
    const result = pagingAfterRefresh(
      prev,
      { kind: 'replaced', items: [status('s9')], cursor: 's9' },
      { kind: 'merged', newer: [] },
    );

    expect(result.paging.statuses.map((s) => s.id)).toEqual(['s9']);
    expect(result.paging.nextMaxId).toBe('s9');
    expect(result.newCount).toBeUndefined();
  });

  it('空だった情報源の置き換えは新着として数える（Bluesky を使っていない場合など）', () => {
    const result = pagingAfterRefresh(
      { ...prev, bluesky: { items: [], cursor: undefined } },
      { kind: 'merged', newer: [status('s3', 30)] },
      { kind: 'replaced', items: [], cursor: undefined },
    );

    expect(result.newCount).toBe(1);
  });
});
