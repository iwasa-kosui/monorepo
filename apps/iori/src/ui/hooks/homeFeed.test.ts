import { describe, expect, it } from 'vitest';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import type { BlueskyTimelinePage } from '../api/mastodonClient.ts';
import {
  appendBlueskyItems,
  blueskyCursorAfterPage,
  blueskySourceOf,
  emptyBlueskySource,
  homeFeedCursor,
  homeItemKey,
  mergeHomeFeed,
} from './homeFeed.ts';

const at = (second: number) => Date.UTC(2026, 10, 8, 12, 0, second);
const status = (id: string, second: number) => ({ id, created_at: new Date(at(second)).toISOString() }) as Status;
const bluesky = (id: string, second: number) =>
  ({ feedItemId: id, indexedAt: at(second) }) as IoriBlueskyTimelineItemBody;
const page = (
  items: readonly IoriBlueskyTimelineItemBody[],
  next: { before: number; beforeId: string | null } | undefined,
): BlueskyTimelinePage => ({
  enabled: true,
  items,
  nextBefore: next?.before ?? null,
  nextBeforeId: next?.beforeId ?? null,
});

const keys = (items: ReturnType<typeof mergeHomeFeed>) => items.map(homeItemKey);

describe('mergeHomeFeed', () => {
  it('両方の情報源を時刻の新しい順に混ぜる', () => {
    const merged = mergeHomeFeed({
      statuses: [status('s1', 50), status('s2', 30), status('s3', 10)],
      hasMoreStatuses: false,
      bluesky: [bluesky('b1', 40), bluesky('b2', 20)],
      hasMoreBluesky: false,
    });

    expect(keys(merged)).toEqual(['s1', 'bluesky:b1', 's2', 'bluesky:b2', 's3']);
  });

  it('次のページがある情報源がなければ、古い項目も含めて全件を表示する', () => {
    const merged = mergeHomeFeed({
      statuses: [status('s1', 50)],
      hasMoreStatuses: false,
      bluesky: [bluesky('b1', 40), bluesky('b2', 1)],
      hasMoreBluesky: false,
    });

    expect(keys(merged)).toEqual(['s1', 'bluesky:b1', 'bluesky:b2']);
  });

  it('片方に次のページがあるとき、その情報源の最も古い時刻より古い項目を表示しない', () => {
    const merged = mergeHomeFeed({
      statuses: [status('s1', 50), status('s2', 30)],
      hasMoreStatuses: true,
      bluesky: [bluesky('b1', 40), bluesky('b2', 20), bluesky('b3', 5)],
      hasMoreBluesky: false,
    });

    expect(keys(merged)).toEqual(['s1', 'bluesky:b1', 's2']);
  });

  it('両方に次のページがあるとき、最も古い時刻のうち新しいほうを下限にする', () => {
    const merged = mergeHomeFeed({
      statuses: [status('s1', 50), status('s2', 30), status('s3', 10)],
      hasMoreStatuses: true,
      bluesky: [bluesky('b1', 45), bluesky('b2', 25)],
      hasMoreBluesky: true,
    });

    expect(keys(merged)).toEqual(['s1', 'bluesky:b1', 's2', 'bluesky:b2']);
  });

  it('下限と同じ時刻の項目は表示する', () => {
    const merged = mergeHomeFeed({
      statuses: [status('s1', 50), status('s2', 30)],
      hasMoreStatuses: true,
      bluesky: [bluesky('b1', 30)],
      hasMoreBluesky: false,
    });

    expect(keys(merged)).toEqual(['s1', 's2', 'bluesky:b1']);
  });

  it('片方が尽きたとき、他方を読み進めると下限が下がって保留していた項目が現れる', () => {
    const bluesky1 = [bluesky('b1', 40), bluesky('b2', 20)];
    const before = mergeHomeFeed({
      statuses: [status('s1', 50), status('s2', 30)],
      hasMoreStatuses: true,
      bluesky: bluesky1,
      hasMoreBluesky: false,
    });
    const after = mergeHomeFeed({
      statuses: [status('s1', 50), status('s2', 30), status('s3', 10)],
      hasMoreStatuses: false,
      bluesky: bluesky1,
      hasMoreBluesky: false,
    });

    expect(keys(before)).toEqual(['s1', 'bluesky:b1', 's2']);
    expect(keys(after)).toEqual(['s1', 'bluesky:b1', 's2', 'bluesky:b2', 's3']);
  });

  it('次のページがある情報源に読み込み済みの項目が無ければ、その情報源は下限に使わない', () => {
    const merged = mergeHomeFeed({
      statuses: [],
      hasMoreStatuses: true,
      bluesky: [bluesky('b1', 40)],
      hasMoreBluesky: false,
    });

    expect(keys(merged)).toEqual(['bluesky:b1']);
  });

  it('Bluesky の取得に失敗したときは iori の項目だけを全件表示する', () => {
    const merged = mergeHomeFeed({
      statuses: [status('s1', 50), status('s2', 30)],
      hasMoreStatuses: true,
      bluesky: blueskySourceOf(undefined).items,
      hasMoreBluesky: blueskySourceOf(undefined).cursor !== undefined,
    });

    expect(merged.every((item) => item.kind === 'status')).toBe(true);
    expect(keys(merged)).toEqual(['s1', 's2']);
  });

  it('同じ時刻なら iori の項目を先にし、各情報源の順序を保つ', () => {
    const merged = mergeHomeFeed({
      statuses: [status('s1', 10), status('s2', 10)],
      hasMoreStatuses: false,
      bluesky: [bluesky('b1', 10), bluesky('b2', 10)],
      hasMoreBluesky: false,
    });

    expect(keys(merged)).toEqual(['s1', 's2', 'bluesky:b1', 'bluesky:b2']);
  });
});

describe('homeItemKey', () => {
  it('Bluesky の項目の key は bluesky:<feedItemId> にする', () => {
    expect(homeItemKey({ kind: 'bluesky', item: bluesky('at://x#repost:did:plc:b', 1) })).toBe(
      'bluesky:at://x#repost:did:plc:b',
    );
  });
});

describe('homeFeedCursor', () => {
  it('どちらにも次のページがなければ undefined にする', () => {
    expect(homeFeedCursor(undefined, undefined)).toBeUndefined();
  });

  it('片方だけに次のページがあっても定義され、カーソルが進むと値が変わる', () => {
    const onlyBluesky = homeFeedCursor(undefined, { before: 1, beforeId: null });

    expect(onlyBluesky).toBeDefined();
    expect(homeFeedCursor('10', undefined)).toBeDefined();
    expect(homeFeedCursor(undefined, { before: 2, beforeId: null })).not.toBe(onlyBluesky);
  });
});

describe('Bluesky の情報源', () => {
  it('取得に失敗したときは項目なし・次のページなしにする', () => {
    expect(blueskySourceOf(undefined)).toEqual(emptyBlueskySource);
  });

  it('1 ページ目の項目と次のカーソルを取り出す', () => {
    const items = [bluesky('b1', 1)];

    expect(blueskySourceOf(page(items, { before: 5, beforeId: 'b1' }))).toEqual({
      items,
      cursor: { before: 5, beforeId: 'b1' },
    });
    expect(blueskySourceOf(page(items, undefined)).cursor).toBeUndefined();
  });

  it('次のページが空のとき、または同じカーソルが返ったときは尽きたものとして扱う', () => {
    const current = { before: 5, beforeId: 'b1' };

    expect(blueskyCursorAfterPage(current, page([], { before: 3, beforeId: null }))).toBeUndefined();
    expect(blueskyCursorAfterPage(current, page([bluesky('b2', 1)], current))).toBeUndefined();
    expect(blueskyCursorAfterPage(current, page([bluesky('b2', 1)], { before: 3, beforeId: null }))).toEqual({
      before: 3,
      beforeId: null,
    });
  });

  it('追加の項目は feedItemId が重複するものを除いて後ろに足す', () => {
    const merged = appendBlueskyItems([bluesky('b1', 3)], [bluesky('b1', 3), bluesky('b2', 2)]);

    expect(merged.map((item) => item.feedItemId)).toEqual(['b1', 'b2']);
  });
});
