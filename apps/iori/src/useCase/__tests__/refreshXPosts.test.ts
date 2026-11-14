import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1FeedEntriesResolverByFeedSourceIdAndGuids } from '../../adaptor/d1/feedEntry/feedEntriesResolverByFeedSourceIdAndGuids.ts';
import { createD1FeedEntryBookmarkCountUpdatedStore } from '../../adaptor/d1/feedEntry/feedEntryBookmarkCountUpdatedStore.ts';
import { createD1FeedEntryCollectedStore } from '../../adaptor/d1/feedEntry/feedEntryCollectedStore.ts';
import { createD1FeedEntryMaxGuidResolverByFeedSourceId } from '../../adaptor/d1/feedEntry/feedEntryMaxGuidResolverByFeedSourceId.ts';
import { createD1FeedSourceFetchedStore } from '../../adaptor/d1/feedSource/feedSourceFetchedStore.ts';
import { createD1FeedSourceFetchFailedStore } from '../../adaptor/d1/feedSource/feedSourceFetchFailedStore.ts';
import { createD1FeedSourceFetchReserver } from '../../adaptor/d1/feedSource/feedSourceFetchReserver.ts';
import { createD1FeedSourcesResolverByEnabled } from '../../adaptor/d1/feedSource/feedSourcesResolverByEnabled.ts';
import type { Tweet, TwitterApiIoClient } from '../../adaptor/twitterApiIo/twitterApiIoClient.ts';
import { type FeedSourceFetchReserver, X_MANUAL_FETCH_COOLDOWN_SECONDS } from '../../domain/feedSource/feedSource.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { RefreshXPostsUseCase } from '../refreshXPosts.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 8, 12));
const COOLDOWN_MS = X_MANUAL_FETCH_COOLDOWN_SECONDS * 1000;
const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

type SourceRow = Readonly<{
  n: number;
  kind?: string;
  enabled?: boolean;
  lastFetchedAt?: number | null;
}>;

const setup = (
  sources: ReadonlyArray<SourceRow>,
  searchUserTweets: TwitterApiIoClient['searchUserTweets'] = async () => RA.ok([]),
  feedSourceFetchReserver?: FeedSourceFetchReserver,
) => {
  const { db, sqlite } = createSqliteD1Fixture();
  const insert = sqlite.prepare(
    'INSERT INTO feed_sources(feedSourceId,kind,url,title,enabled,lastFetchedAt,createdAt) VALUES (?,?,?,?,?,?,?)',
  );
  for (const { n, kind = 'x_user', enabled = true, lastFetchedAt = null } of sources) {
    insert.run(idOf(n), kind, `https://x.com/user${n}`, `@user${n}`, enabled ? 1 : 0, lastFetchedAt, 1_000);
  }
  const client = vi.fn(searchUserTweets);
  const useCase = RefreshXPostsUseCase.create({
    feedSourcesResolverByEnabled: createD1FeedSourcesResolverByEnabled(db),
    feedSourceFetchReserver: feedSourceFetchReserver ?? createD1FeedSourceFetchReserver(db),
    feedEntriesResolverByFeedSourceIdAndGuids: createD1FeedEntriesResolverByFeedSourceIdAndGuids(db),
    feedSourceFetchedStore: createD1FeedSourceFetchedStore(db),
    feedSourceFetchFailedStore: createD1FeedSourceFetchFailedStore(db),
    feedEntryCollectedStore: createD1FeedEntryCollectedStore(db),
    feedEntryBookmarkCountUpdatedStore: createD1FeedEntryBookmarkCountUpdatedStore(db),
    feedEntryMaxGuidResolverByFeedSourceId: createD1FeedEntryMaxGuidResolverByFeedSourceId(db),
    twitterApiIoClient: { searchUserTweets: client },
    now: () => NOW,
  });
  const fetchedUsernames = () => client.mock.calls.map(([query]) => query.username as string);
  const rowOf = (n: number) =>
    sqlite.prepare('SELECT lastFetchedAt, lastError FROM feed_sources WHERE feedSourceId = ?').get(idOf(n)) as {
      lastFetchedAt: number | null;
      lastError: string | null;
    };
  return { useCase, sqlite, client, fetchedUsernames, rowOf };
};

const tweet = (id: string): Tweet => ({ id, text: `post ${id}`, createdAt: Instant.orThrow(NOW - 60_000) });

describe('RefreshXPostsUseCase', () => {
  it('6 件あるときは 5 件だけ、lastFetchedAt の古い順（NULL が先）に取得する', async () => {
    const old = NOW - 10 * COOLDOWN_MS;
    const { useCase, fetchedUsernames } = setup([
      { n: 1, lastFetchedAt: old + 5_000 },
      { n: 2, lastFetchedAt: null },
      { n: 3, lastFetchedAt: old + 1_000 },
      { n: 4, lastFetchedAt: old + 3_000 },
      { n: 5, lastFetchedAt: old },
      { n: 6, lastFetchedAt: old + 2_000 },
    ]);

    const result = await useCase.run();

    expect(result).toEqual({ ok: true, val: { sources: 5, failed: 0, collected: 0 } });
    expect(fetchedUsernames()).toEqual(['user2', 'user5', 'user3', 'user6', 'user4']);
  });

  it('クールダウン中の情報源は取得せず、過ぎたものだけを取得する', async () => {
    const { useCase, fetchedUsernames } = setup([
      { n: 1, lastFetchedAt: NOW - COOLDOWN_MS + 1_000 },
      { n: 2, lastFetchedAt: NOW - COOLDOWN_MS },
      { n: 3, lastFetchedAt: null },
    ]);

    const result = await useCase.run();

    expect(result).toEqual({ ok: true, val: { sources: 2, failed: 0, collected: 0 } });
    expect(fetchedUsernames().sort()).toEqual(['user2', 'user3']);
  });

  it('全件がクールダウン中なら、最も早く使えるまでの秒数（切り上げ）を持つエラーを返し、取得しない', async () => {
    const { useCase, client } = setup([
      { n: 1, lastFetchedAt: NOW - 10_000 },
      { n: 2, lastFetchedAt: NOW - 100_500 },
    ]);

    const result = await useCase.run();

    expect(result).toMatchObject({
      ok: false,
      err: { type: 'FeedSourceFetchCooldownError', detail: { retryAfterSeconds: 200 } },
    });
    expect(client).not.toHaveBeenCalled();
  });

  it('使えるまでの残りが 1 秒未満でも retryAfterSeconds は 1 以上にする', async () => {
    const { useCase } = setup([{ n: 1, lastFetchedAt: NOW - COOLDOWN_MS + 1 }]);

    const result = await useCase.run();

    expect(result).toMatchObject({ ok: false, err: { detail: { retryAfterSeconds: 1 } } });
  });

  it('全件が同時実行に負けて予約できないときは、クールダウンの秒数を持つエラーを返し、取得しない', async () => {
    const { useCase, client } = setup([{ n: 1 }, { n: 2 }], undefined, { reserve: async () => RA.ok(false) });

    const result = await useCase.run();

    expect(result).toMatchObject({
      ok: false,
      err: { type: 'FeedSourceFetchCooldownError', detail: { retryAfterSeconds: X_MANUAL_FETCH_COOLDOWN_SECONDS } },
    });
    expect(client).not.toHaveBeenCalled();
  });

  it('取得の候補が同時実行に負け、ほかの情報源がクールダウン中のときも、クールダウンの秒数を持つエラーを返す', async () => {
    const { useCase, client } = setup(
      [{ n: 1 }, { n: 2, lastFetchedAt: NOW - 10_000 }],
      undefined,
      { reserve: async () => RA.ok(false) },
    );

    const result = await useCase.run();

    expect(result).toMatchObject({
      ok: false,
      err: { type: 'FeedSourceFetchCooldownError', detail: { retryAfterSeconds: X_MANUAL_FETCH_COOLDOWN_SECONDS } },
    });
    expect(client).not.toHaveBeenCalled();
  });

  it('個別の失敗を lastError に記録して失敗に数え、残りの取得を続ける', async () => {
    const { useCase, fetchedUsernames, rowOf } = setup(
      [{ n: 1 }, { n: 2 }, { n: 3 }],
      async ({ username }) =>
        username === 'user1'
          ? RA.err({ type: 'TwitterApiIoError', message: 'Unexpected status 500.', status: 500 })
          : RA.ok([tweet(username === 'user2' ? '200' : '300')]),
    );

    const result = await useCase.run();

    expect(result).toEqual({ ok: true, val: { sources: 3, failed: 1, collected: 2 } });
    expect(fetchedUsernames()).toEqual(['user1', 'user2', 'user3']);
    expect(rowOf(1)).toEqual({ lastFetchedAt: NOW, lastError: 'Unexpected status 500.' });
    expect(rowOf(2)).toEqual({ lastFetchedAt: NOW, lastError: null });
  });
});
