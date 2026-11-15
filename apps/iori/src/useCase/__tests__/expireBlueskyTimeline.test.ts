import { describe, expect, it } from 'vitest';

import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1BlueskyTimelineItemsExpiredStore } from '../../adaptor/d1/blueskyTimeline/blueskyTimelineItemsExpiredStore.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { UserId } from '../../domain/user/userId.ts';
import { ExpireBlueskyTimelineUseCase } from '../expireBlueskyTimeline.ts';

const USER_ID = UserId.orThrow('00000000-0000-4000-8000-0000000000a1');
const DAY = 24 * 60 * 60 * 1000;
const NOW = Instant.orThrow(Date.UTC(2026, 10, 8, 12));

describe('ExpireBlueskyTimelineUseCase', () => {
  it('保持期限（30 日）より古い行だけを削除する', async () => {
    const { db, sqlite } = createSqliteD1Fixture();
    sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(USER_ID, 'alice');
    const insert = sqlite.prepare(
      'INSERT INTO bluesky_timeline_items(userId,feedItemId,uri,cid,authorDid,authorHandle,text,facets,postedAt,indexedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    );
    insert.run(USER_ID, 'old', 'old', 'c', 'did', 'h', 't', '[]', 1, NOW - 30 * DAY - 1, 1);
    insert.run(USER_ID, 'edge', 'edge', 'c', 'did', 'h', 't', '[]', 1, NOW - 30 * DAY, 1);
    insert.run(USER_ID, 'new', 'new', 'c', 'did', 'h', 't', '[]', 1, NOW, 1);
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
