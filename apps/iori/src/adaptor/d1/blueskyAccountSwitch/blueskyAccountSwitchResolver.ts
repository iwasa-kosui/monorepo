import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import {
  BlueskyAccountSwitch,
  type BlueskyAccountSwitchResolver,
} from '../../../domain/blueskyAccountSwitch/blueskyAccountSwitch.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyAccountSwitchTable } from '../schema.ts';

export const createD1BlueskyAccountSwitchResolver = (db: IoriD1Db, userId: UserId): BlueskyAccountSwitchResolver => ({
  resolve: async () => {
    const [row] = await db.select().from(blueskyAccountSwitchTable)
      .where(eq(blueskyAccountSwitchTable.userId, userId)).limit(1);
    return RA.ok(
      row === undefined ? undefined : BlueskyAccountSwitch.parseOrThrow({
        switchId: row.switchId,
        fromDid: row.fromDid,
        toDid: row.toDid,
        startedAt: row.startedAt.getTime(),
        attempts: row.attempts,
        lastError: row.lastError,
        deletedCounts: JSON.parse(row.deletedCounts),
        updatedAt: row.updatedAt.getTime(),
      }),
    );
  },
});

/** アカウントを切り替えている途中のユーザー。定期実行で、切り替えの後始末をしたり、同期を止めたりするのに使う */
export const createD1BlueskyAccountSwitchingUserIdsResolver = (db: IoriD1Db) => ({
  resolve: async (): Promise<readonly UserId[]> => {
    const rows = await db.select({ userId: blueskyAccountSwitchTable.userId }).from(blueskyAccountSwitchTable);
    return rows.map((row) => row.userId as UserId);
  },
});
