import { describe, expect, it } from 'vitest';

import type { CredentialAccount, Status } from '../../adaptor/mastodon/entities.ts';
import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import type { HomeFeedPaging } from './homeFeed.ts';
import { parseSnapshot, SNAPSHOT_MAX_AGE_MS, snapshotOf, trimPagingForSnapshot } from './homeSnapshot.ts';

const at = (second: number) => Date.UTC(2026, 10, 8, 12, 0, 0) + second * 1000;
const status = (id: string, second: number, uri: string = `https://example.com/notes/${id}`) =>
  ({ id, uri, created_at: new Date(at(second)).toISOString() }) as Status;
const bluesky = (id: string, second: number, uri: string = `at://did:plc:x/app.bsky.feed.post/${id}`) =>
  ({ feedItemId: id, uri, indexedAt: at(second) }) as IoriBlueskyTimelineItemBody;
const me = { id: 'me' } as CredentialAccount;

/** 新しい順に、偶数秒はステータス・奇数秒は Bluesky を交互に並べる。 */
const pagingOf = (count: number): HomeFeedPaging => {
  const seconds = Array.from({ length: count }, (_, index) => count - index);
  return {
    statuses: seconds.filter((second) => second % 2 === 0).map((second) => status(`s${second}`, second)),
    nextMaxId: 'older-status',
    bluesky: {
      items: seconds.filter((second) => second % 2 === 1).map((second) => bluesky(`b${second}`, second)),
      cursor: { before: at(0), beforeId: 'older-bluesky' },
    },
  };
};

describe('trimPagingForSnapshot', () => {
  it('読んでいる位置の少し下までを残し、残した最後のアイテムを次のカーソルにする', () => {
    const paging = pagingOf(200);

    const trimmed = trimPagingForSnapshot(paging, 's150');

    // 先頭から s150 まで 51件 + 下に 20件
    expect(trimmed.statuses.length + trimmed.bluesky.items.length).toBe(71);
    const lastStatus = trimmed.statuses[trimmed.statuses.length - 1];
    expect(trimmed.nextMaxId).toBe(lastStatus?.id);
    const lastBluesky = trimmed.bluesky.items[trimmed.bluesky.items.length - 1];
    expect(trimmed.bluesky.cursor).toEqual({ before: lastBluesky?.indexedAt, beforeId: lastBluesky?.feedItemId });
  });

  it('切り詰める必要がなければカーソルをそのまま保つ', () => {
    const paging = pagingOf(10);

    const trimmed = trimPagingForSnapshot(paging, 's2');

    expect(trimmed.statuses).toEqual(paging.statuses);
    expect(trimmed.nextMaxId).toBe('older-status');
  });

  it('まだ表示されていない古いアイテムは落とし、そこから読み直せるカーソルにする', () => {
    const paging = pagingOf(10);

    const trimmed = trimPagingForSnapshot(paging, 's2');

    // ステータスの最古（2秒）より古い b1 は画面に出ていないので保存しない
    expect(trimmed.bluesky.items.map((item) => item.feedItemId)).toEqual(['b9', 'b7', 'b5', 'b3']);
    expect(trimmed.bluesky.cursor).toEqual({ before: at(3), beforeId: 'b3' });
  });

  it('ブリッジの status は隠れるので、保存する件数に数えない', () => {
    const postUri = 'at://did:plc:x/app.bsky.feed.post/real';
    const paging: HomeFeedPaging = {
      statuses: [status('s3', 30), status('bridged', 20, `https://bsky.brid.gy/convert/ap/${postUri}`)],
      nextMaxId: undefined,
      bluesky: { items: [bluesky('b1', 21, postUri)], cursor: undefined },
    };

    const trimmed = trimPagingForSnapshot(paging, undefined);

    expect(trimmed.statuses.map((item) => item.id)).toEqual(['s3']);
    expect(trimmed.bluesky.items.map((item) => item.feedItemId)).toEqual(['b1']);
  });

  it('ブリッジの status が隠れただけで、何も切っていないときは nextMaxId を変えない', () => {
    const postUri = 'at://did:plc:x/app.bsky.feed.post/real';
    const paging: HomeFeedPaging = {
      statuses: [status('s3', 30), status('bridged', 20, `https://bsky.brid.gy/convert/ap/${postUri}`)],
      nextMaxId: 'older-status',
      bluesky: { items: [bluesky('b1', 21, postUri)], cursor: undefined },
    };

    const trimmed = trimPagingForSnapshot(paging, undefined);

    expect(trimmed.statuses.map((item) => item.id)).toEqual(['s3']);
    expect(trimmed.nextMaxId).toBe('older-status');
  });

  it('上限を超えるときは上限で切る', () => {
    const trimmed = trimPagingForSnapshot(pagingOf(500), 's10', 300);

    expect(trimmed.statuses.length + trimmed.bluesky.items.length).toBe(300);
  });

  it('片方の情報源が1件も残らないときも、続きを読めるよう最新の1件は残す', () => {
    const paging: HomeFeedPaging = {
      statuses: Array.from({ length: 100 }, (_, index) => status(`s${index}`, 1000 - index)),
      nextMaxId: 'older',
      bluesky: { items: [bluesky('b-old', 1)], cursor: { before: at(0), beforeId: 'x' } },
    };

    const trimmed = trimPagingForSnapshot(paging, undefined);

    expect(trimmed.bluesky.items.map((item) => item.feedItemId)).toEqual(['b-old']);
  });
});

describe('snapshotOf', () => {
  it('切り詰めで読み位置のアイテムが消えたら読み位置を捨てる', () => {
    const snapshot = snapshotOf({ me, paging: pagingOf(500), anchor: { key: 's10', offset: 0 } }, at(0), 100);

    expect(snapshot.anchor).toBeUndefined();
  });

  it('Bluesky のアイテムも読み位置にできる', () => {
    const snapshot = snapshotOf({ me, paging: pagingOf(10), anchor: { key: 'bluesky:b5', offset: -12 } }, at(0));

    expect(snapshot.anchor).toEqual({ key: 'bluesky:b5', offset: -12 });
  });
});

describe('parseSnapshot', () => {
  const valid = () => JSON.parse(JSON.stringify(snapshotOf({ me, paging: pagingOf(6), anchor: undefined }, at(0))));

  it('保存したスナップショットを読み戻せる', () => {
    const parsed = parseSnapshot(valid(), at(10));

    expect(parsed?.paging.statuses.map((s) => s.id)).toEqual(['s6', 's4', 's2']);
    expect(parsed?.paging.nextMaxId).toBe('older-status');
  });

  it('古すぎるスナップショットは捨てる', () => {
    expect(parseSnapshot(valid(), at(0) + SNAPSHOT_MAX_AGE_MS)).toBeUndefined();
  });

  it('形の壊れたスナップショットは捨てる', () => {
    expect(parseSnapshot({ ...valid(), paging: { statuses: 'x' } }, at(10))).toBeUndefined();
    expect(parseSnapshot({ ...valid(), anchor: { key: 1 } }, at(10))).toBeUndefined();
    expect(parseSnapshot(null, at(10))).toBeUndefined();
  });
});
