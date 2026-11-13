import { RA } from '@iwasa-kosui/result';
import { eq, sql } from 'drizzle-orm';

import type {
  BlueskyAccountSwitchCompletedStore,
  BlueskyAccountSwitchFailedStore,
  BlueskyAccountSwitchProgressStore,
} from '../../../domain/blueskyAccountSwitch/blueskyAccountSwitch.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { blueskyAccountSwitchTable, domainEventsTable } from '../schema.ts';

export const createD1BlueskyAccountSwitchProgressStore = (db: IoriD1Db): BlueskyAccountSwitchProgressStore => ({
  record: async (switchId, target, deleted, at) => {
    const path = `$.${target}`;
    const counts = blueskyAccountSwitchTable.deletedCounts;
    await db.update(blueskyAccountSwitchTable)
      .set({
        deletedCounts: sql`json_set(${counts}, ${path}, coalesce(json_extract(${counts}, ${path}), 0) + ${deleted})`,
        updatedAt: new Date(at),
      })
      .where(eq(blueskyAccountSwitchTable.switchId, switchId));
    return RA.ok(undefined);
  },
});

export const createD1BlueskyAccountSwitchFailedStore = (db: IoriD1Db): BlueskyAccountSwitchFailedStore => ({
  store: async (failed) => {
    await db.update(blueskyAccountSwitchTable)
      .set({ attempts: failed.attempts, lastError: failed.lastError, updatedAt: new Date(failed.updatedAt) })
      .where(eq(blueskyAccountSwitchTable.switchId, failed.switchId));
    return RA.ok(undefined);
  },
});

export const createD1BlueskyAccountSwitchCompletedStore = (db: IoriD1Db): BlueskyAccountSwitchCompletedStore => ({
  store: async (event, switchId) => {
    await runBatch(db, [
      db.delete(blueskyAccountSwitchTable).where(eq(blueskyAccountSwitchTable.switchId, switchId)),
      db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
    ]);
    return RA.ok(undefined);
  },
});
