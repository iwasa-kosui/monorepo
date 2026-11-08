import { describe, expect, it } from 'vitest';

import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1BlueskyTimelineItemsExpiredStore } from '../../adaptor/d1/blueskyTimeline/blueskyTimelineItemsExpiredStore.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { ExpireBlueskyTimelineUseCase } from '../expireBlueskyTimeline.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Instant.orThrow(Date.UTC(2026, 10, 8, 12));

describe('ExpireBlueskyTimelineUseCase', () => {
  it('保持期限（30 日）より古い行だけを削除する', async () => {
    const { db, sqlite } = createSqliteD1Fixture();
    const insert = sqlite.prepare(
      'INSERT INTO bluesky_timeline_items(feedItemId,uri,cid,authorDid,authorHandle,text,facets,postedAt,indexedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
    );
    insert.run('old', 'old', 'c', 'did', 'h', 't', '[]', 1, NOW - 30 * DAY - 1, 1);
    insert.run('edge', 'edge', 'c', 'did', 'h', 't', '[]', 1, NOW - 30 * DAY, 1);
    insert.run('new', 'new', 'c', 'did', 'h', 't', '[]', 1, NOW, 1);
    const useCase = ExpireBlueskyTimelineUseCase.create({
      expiredStore: createD1BlueskyTimelineItemsExpiredStore(db),
      now: () => NOW,
    });

    const result = await useCase.run();

    expect(result).toEqual({ ok: true, val: undefined });
    expect(sqlite.prepare('SELECT feedItemId FROM bluesky_timeline_items ORDER BY feedItemId').all()).toEqual([
      { feedItemId: 'edge' },
      { feedItemId: 'new' },
    ]);
  });
});
