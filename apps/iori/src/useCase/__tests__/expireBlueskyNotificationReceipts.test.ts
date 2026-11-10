import { describe, expect, it } from 'vitest';

import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1BlueskyNotificationReceiptsExpiredStore } from '../../adaptor/d1/blueskyNotification/blueskyNotificationReceiptsExpiredStore.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { ExpireBlueskyNotificationReceiptsUseCase } from '../expireBlueskyNotificationReceipts.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Instant.orThrow(Date.UTC(2026, 10, 8, 12));

describe('ExpireBlueskyNotificationReceiptsUseCase', () => {
  it('保持期限（30 日）に 1 日足した境界より古い受信の記録だけを削除する', async () => {
    const { db, sqlite } = createSqliteD1Fixture();
    const insert = sqlite.prepare('INSERT INTO bluesky_notification_receipts(uri,indexedAt,receivedAt) VALUES (?,?,?)');
    insert.run('old', NOW - 31 * DAY - 1, 1);
    insert.run('edge', NOW - 31 * DAY, 1);
    insert.run('retained', NOW - 30 * DAY, 1);
    insert.run('new', NOW, 1);
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
