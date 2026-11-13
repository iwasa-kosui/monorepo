import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import {
  BlueskyAccountSwitch,
  type BlueskyAccountSwitchResolver,
} from '../../../domain/blueskyAccountSwitch/blueskyAccountSwitch.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyAccountSwitchTable } from '../schema.ts';

export const BLUESKY_ACCOUNT_SWITCH_ID = 'default';

export const createD1BlueskyAccountSwitchResolver = (db: IoriD1Db): BlueskyAccountSwitchResolver => ({
  resolve: async () => {
    const [row] = await db.select().from(blueskyAccountSwitchTable)
      .where(eq(blueskyAccountSwitchTable.id, BLUESKY_ACCOUNT_SWITCH_ID)).limit(1);
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
