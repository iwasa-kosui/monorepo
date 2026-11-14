import { describe, expect, it } from 'vitest';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import type { BlueskyTimelinePage, Page } from '../api/mastodonClient.ts';
import {
  appendBlueskyItems,
  blueskyCursorAfterPage,
  blueskySourceOf,
  bridgedBlueskyUriOf,
  emptyBlueskySource,
  homeFeedCursor,
  type HomeFeedPaging,
  homeItemKey,
  type LoadMoreFetched,
  mergeHomeFeed,
  pagingAfterLoadMore,
  settleLoadMore,
} from './homeFeed.ts';

const at = (second: number) => Date.UTC(2026, 10, 8, 12, 0, second);
const status = (id: string, second: number, extra: Partial<Status> = {}) =>
  ({ id, uri: `https://example.com/notes/${id}`, created_at: new Date(at(second)).toISOString(), ...extra }) as Status;
const bluesky = (id: string, second: number, uri: string = `at://did:plc:x/app.bsky.feed.post/${id}`) =>
  ({ feedItemId: id, uri, indexedAt: at(second) }) as IoriBlueskyTimelineItemBody;
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

const postUri = 'at://did:plc:3ljmtyyjqcjee2kpewgsifvb/app.bsky.feed.post/3lhputf77w22j';
const bridgedId = `https://bsky.brid.gy/convert/ap/${postUri}`;
const bridged = (id: string, second: number) => status(id, second, { uri: bridgedId, url: bridgedId });
const boostOf = (id: string, second: number, inner: Status) => status(id, second, { reblog: inner });
const merge = (statuses: readonly Status[], items: readonly IoriBlueskyTimelineItemBody[]) =>
  keys(mergeHomeFeed({ statuses, hasMoreStatuses: false, bluesky: items, hasMoreBluesky: false }));

describe('mergeHomeFeed の Bridgy Fed の重複', () => {
  it('本物の Bluesky の投稿とブリッジの投稿が両方あると、ブリッジ側の status を隠す', () => {
    expect(merge([status('s1', 50), bridged('s2', 30)], [bluesky('b1', 31, postUri)])).toEqual([
      's1',
      'bluesky:b1',
    ]);
  });

  it('ブリッジ側だけならそのまま表示する', () => {
    expect(merge([bridged('s1', 30)], [bluesky('b1', 31)])).toEqual(['bluesky:b1', 's1']);
  });

  it('ブーストの内側がブリッジの投稿でも隠す', () => {
    const boost = boostOf('s1', 40, bridged('inner', 30));

    expect(merge([boost], [bluesky('b1', 31, postUri)])).toEqual(['bluesky:b1']);
  });

  it('Bluesky 側がリポストの項目でも、元の投稿の uri が一致すれば隠す', () => {
    const repost = bluesky(`${postUri}#repost:did:plc:b`, 31, postUri);

    expect(merge([bridged('s1', 30)], [repost])).toEqual([`bluesky:${postUri}#repost:did:plc:b`]);
  });

  it('普通の Fediverse の投稿と、bsky.brid.gy 以外の URL は隠さない', () => {
    const lookalike = status('s2', 30, { uri: `https://example.com/convert/ap/${postUri}` });

    expect(merge([status('s1', 40), lookalike], [bluesky('b1', 31, postUri)])).toEqual(['s1', 'bluesky:b1', 's2']);
  });

  it('Bluesky が後のページで届いても、残るのは常に Bluesky 側にする', () => {
    const statuses = [status('s1', 50), bridged('s2', 30)];
    const real = bluesky('b1', 31, postUri);

    expect(merge(statuses, [])).toEqual(['s1', 's2']);
    expect(merge(statuses, [real])).toEqual(['s1', 'bluesky:b1']);
    expect(merge([...statuses].reverse(), [real])).toEqual(['s1', 'bluesky:b1']);
  });

  it('下限より古い Bluesky の項目があっても、対応するブリッジの status は隠す', () => {
    const merged = mergeHomeFeed({
      statuses: [status('s1', 50), bridged('s2', 40)],
      hasMoreStatuses: true,
      bluesky: [bluesky('b1', 45), bluesky('b2', 10, postUri)],
      hasMoreBluesky: false,
    });

    expect(keys(merged)).toEqual(['s1', 'bluesky:b1']);
  });
});

describe('mergeHomeFeed の Fediverse の投稿のブリッジの重複', () => {
  const fromFediverse = (id: string, second: number, bridgedFromPostId: string | null, uri?: string) =>
    ({
      ...bluesky(id, second, uri),
      authorHandle: 'alice.mastodon.example.ap.brid.gy',
      bridgedFromPostId,
    }) as IoriBlueskyTimelineItemBody;

  it('本物の Fediverse の投稿とブリッジの投稿が両方あると、Bluesky 側のブリッジを隠す', () => {
    expect(merge([status('s1', 50), status('s2', 30)], [fromFediverse('b1', 31, 's2')])).toEqual(['s1', 's2']);
  });

  it('ブリッジ側だけなら、そのまま表示する', () => {
    expect(merge([status('s1', 50)], [fromFediverse('b1', 31, 's9')])).toEqual(['s1', 'bluesky:b1']);
    expect(merge([status('s1', 50)], [fromFediverse('b1', 31, null)])).toEqual(['s1', 'bluesky:b1']);
  });

  it('Bluesky 側がリポストの項目でも隠す', () => {
    const repost = {
      ...fromFediverse('r1', 31, 's2'),
      repostedByDid: 'did:plc:b',
      repostedByHandle: 'bob.bsky.social',
    };

    expect(merge([status('s2', 30)], [repost])).toEqual(['s2']);
  });

  it('Fediverse 側がブーストのときは、内側の投稿と一致すれば隠す', () => {
    const boost = boostOf('s1', 40, status('inner', 30));

    expect(merge([boost], [fromFediverse('b1', 31, 'inner')])).toEqual(['s1']);
    expect(merge([boost], [fromFediverse('b2', 31, 's1')])).toEqual(['s1', 'bluesky:b2']);
  });

  it('bridgedFromPostId が無い項目（ブリッジでない投稿、古いスナップショット）は隠さない', () => {
    const old = { ...bluesky('b1', 31), authorHandle: 'alice.mastodon.example.ap.brid.gy' };

    expect(merge([status('s1', 50)], [old as IoriBlueskyTimelineItemBody, bluesky('b2', 20)])).toEqual([
      's1',
      'bluesky:b1',
      'bluesky:b2',
    ]);
  });

  it('読み込み順を変えても、残るのは常に Fediverse 側にする', () => {
    const statuses = [status('s1', 50), status('s2', 30)];
    const bridge = fromFediverse('b1', 31, 's2');

    expect(merge(statuses, [bridge])).toEqual(['s1', 's2']);
    expect(merge([...statuses].reverse(), [bridge])).toEqual(['s1', 's2']);
    expect(merge([status('s1', 50)], [bridge])).toEqual(['s1', 'bluesky:b1']);
  });

  it('下限より古い Fediverse の投稿があっても、対応する Bluesky 側のブリッジは隠す', () => {
    const merged = mergeHomeFeed({
      statuses: [status('s1', 50), status('s2', 10)],
      hasMoreStatuses: false,
      bluesky: [bluesky('b1', 45), fromFediverse('b2', 40, 's2')],
      hasMoreBluesky: true,
    });

    expect(keys(merged)).toEqual(['s1', 'bluesky:b1']);
  });

  it('両方向の重複を同時に隠す', () => {
    const merged = merge(
      [status('s1', 50), bridged('s2', 40), status('s3', 30)],
      [bluesky('b1', 41, postUri), fromFediverse('b2', 31, 's3')],
    );

    expect(merged).toEqual(['s1', 'bluesky:b1', 's3']);
  });
});

describe('bridgedBlueskyUriOf', () => {
  it('Bridgy Fed の id から at:// URI を取り出す', () => {
    expect(bridgedBlueskyUriOf(bridged('s1', 1))).toBe(postUri);
  });

  it('エンコードされた at:// URI も取り出す', () => {
    const encoded = `https://bsky.brid.gy/convert/ap/${encodeURIComponent(postUri)}`;

    expect(bridgedBlueskyUriOf(status('s1', 1, { uri: encoded }))).toBe(postUri);
  });

  it('ブーストは内側の投稿で判定する', () => {
    expect(bridgedBlueskyUriOf(boostOf('s1', 2, bridged('inner', 1)))).toBe(postUri);
    expect(bridgedBlueskyUriOf(boostOf('s1', 2, status('inner', 1)))).toBeNull();
  });

  it('Bridgy Fed の id でなければ null にする', () => {
    expect(bridgedBlueskyUriOf(status('s1', 1))).toBeNull();
    expect(bridgedBlueskyUriOf(status('s1', 1, { uri: 'https://bsky.brid.gy/convert/ap/did:plc:x' }))).toBeNull();
    expect(bridgedBlueskyUriOf(status('s1', 1, { uri: 'https://bsky.brid.gy/r/https://example.com' }))).toBeNull();
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

describe('追加読み込みの結果から次の状態を計算する', () => {
  const statusPage = (items: readonly Status[], nextMaxId: string | undefined): Page<Status> => ({
    items,
    nextMaxId,
    prevMinId: undefined,
  });
  const fulfilled = <T>(value: T): PromiseFulfilledResult<T> => ({ status: 'fulfilled', value });
  const rejected = (reason: unknown): PromiseRejectedResult => ({ status: 'rejected', reason });
  const skipped = fulfilled(undefined);

  const settle = (prev: HomeFeedPaging, fetched: LoadMoreFetched) => {
    const outcome = settleLoadMore({
      maxId: prev.nextMaxId,
      blueskyCursor: prev.bluesky.cursor,
    }, fetched);
    if (outcome.kind === 'homeFailed') return { outcome, paging: prev, shown: undefined };
    const paging = pagingAfterLoadMore(prev, outcome.advance);
    const shown = keys(mergeHomeFeed({
      statuses: paging.statuses,
      hasMoreStatuses: paging.nextMaxId !== undefined,
      bluesky: paging.bluesky.items,
      hasMoreBluesky: paging.bluesky.cursor !== undefined,
    }));
    return { outcome, paging, shown };
  };

  const before: HomeFeedPaging = {
    statuses: [status('s1', 50), status('s2', 30)],
    nextMaxId: 's2',
    bluesky: { items: [bluesky('b1', 45), bluesky('b2', 40)], cursor: { before: 40, beforeId: 'b2' } },
  };

  it('両方が成功したときは、両方の項目を足してカーソルを進める', () => {
    const { paging, shown } = settle(before, {
      home: fulfilled(statusPage([status('s3', 20)], 's3')),
      bluesky: fulfilled(page([bluesky('b3', 35)], { before: 35, beforeId: 'b3' })),
    });

    expect(paging.nextMaxId).toBe('s3');
    expect(paging.bluesky.cursor).toEqual({ before: 35, beforeId: 'b3' });
    expect(shown).toEqual(['s1', 'bluesky:b1', 'bluesky:b2', 'bluesky:b3']);
  });

  it('Bluesky だけ失敗したとき、Bluesky のカーソルを消して下限から外し、iori の項目を表示する', () => {
    const { paging, shown } = settle(before, {
      home: fulfilled(statusPage([status('s3', 20), status('s4', 10)], 's4')),
      bluesky: rejected(new Error('bluesky down')),
    });

    expect(paging.bluesky.cursor).toBeUndefined();
    expect(paging.bluesky.items).toEqual(before.bluesky.items);
    expect(paging.nextMaxId).toBe('s4');
    expect(shown).toEqual(['s1', 'bluesky:b1', 'bluesky:b2', 's2', 's3', 's4']);
  });

  it('iori が尽きていて Bluesky だけ読んで失敗したとき、隠れていた iori の項目を表示する', () => {
    const exhausted: HomeFeedPaging = {
      statuses: [status('s1', 50), status('s2', 30), status('s3', 10)],
      nextMaxId: undefined,
      bluesky: { items: [bluesky('b1', 45), bluesky('b2', 40)], cursor: { before: 40, beforeId: 'b2' } },
    };
    const hidden = keys(mergeHomeFeed({
      statuses: exhausted.statuses,
      hasMoreStatuses: false,
      bluesky: exhausted.bluesky.items,
      hasMoreBluesky: true,
    }));

    const { paging, shown } = settle(exhausted, { home: skipped, bluesky: rejected(new Error('bluesky down')) });

    expect(hidden).toEqual(['s1', 'bluesky:b1', 'bluesky:b2']);
    expect(paging.bluesky.cursor).toBeUndefined();
    expect(paging.statuses).toEqual(exhausted.statuses);
    expect(shown).toEqual(['s1', 'bluesky:b1', 'bluesky:b2', 's2', 's3']);
  });

  it('ホームの API だけが失敗したとき、Bluesky のページを捨ててカーソルも項目も変えない', () => {
    const { outcome, paging } = settle(before, {
      home: rejected(new Error('home down')),
      bluesky: fulfilled(page([bluesky('b3', 35)], { before: 35, beforeId: 'b3' })),
    });

    expect(outcome).toEqual({ kind: 'homeFailed', reason: new Error('home down') });
    expect(paging).toBe(before);
    expect(homeFeedCursor(paging.nextMaxId, paging.bluesky.cursor)).toBe(
      homeFeedCursor(before.nextMaxId, before.bluesky.cursor),
    );
  });

  it('ホームの API を読みに行かなかったとき、Bluesky が成功すればカーソルを進める', () => {
    const exhausted: HomeFeedPaging = { ...before, nextMaxId: undefined };

    const { paging } = settle(exhausted, {
      home: skipped,
      bluesky: fulfilled(page([bluesky('b3', 35)], { before: 35, beforeId: 'b3' })),
    });

    expect(paging.nextMaxId).toBeUndefined();
    expect(paging.bluesky.items.map((item) => item.feedItemId)).toEqual(['b1', 'b2', 'b3']);
    expect(paging.bluesky.cursor).toEqual({ before: 35, beforeId: 'b3' });
  });
});
