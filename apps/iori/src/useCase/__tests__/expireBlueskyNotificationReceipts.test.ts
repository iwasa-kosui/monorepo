import { describe, expect, it } from 'vitest';

import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1BlueskyNotificationReceiptsExpiredStore } from '../../adaptor/d1/blueskyNotification/blueskyNotificationReceiptsExpiredStore.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { UserId } from '../../domain/user/userId.ts';
import { ExpireBlueskyNotificationReceiptsUseCase } from '../expireBlueskyNotificationReceipts.ts';

const USER_ID = UserId.orThrow('00000000-0000-4000-8000-0000000000a1');
const DAY = 24 * 60 * 60 * 1000;
const NOW = Instant.orThrow(Date.UTC(2026, 10, 8, 12));

describe('ExpireBlueskyNotificationReceiptsUseCase', () => {
  it('保持期限（30 日）に 1 日足した境界より古い受信の記録だけを削除する', async () => {
    const { db, sqlite } = createSqliteD1Fixture();
    sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(USER_ID, 'alice');
    const insert = sqlite.prepare(
      'INSERT INTO bluesky_notification_receipts(userId,uri,indexedAt,receivedAt) VALUES (?,?,?,?)',
    );
    insert.run(USER_ID, 'old', NOW - 31 * DAY - 1, 1);
    insert.run(USER_ID, 'edge', NOW - 31 * DAY, 1);
    insert.run(USER_ID, 'retained', NOW - 30 * DAY, 1);
    insert.run(USER_ID, 'new', NOW, 1);
    const useCase = ExpireBlueskyNotificationReceiptsUseCase.create({
      expiredStore: createD1BlueskyNotificationReceiptsExpiredStore(db),
      now: () => NOW,
    });

    const result = await useCase.run();

    expect(result).toEqual({ ok: true, val: undefined });
    expect(sqlite.prepare('SELECT uri FROM bluesky_notification_receipts ORDER BY uri').all()).toEqual([
      { uri: 'edge' },
      { uri: 'new' },
      { uri: 'retained' },
    ]);
  });
});
