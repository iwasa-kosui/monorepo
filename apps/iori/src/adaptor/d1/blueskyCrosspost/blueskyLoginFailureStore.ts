import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type {
  BlueskyLoginFailureDeletedStore,
  BlueskyLoginFailureResolver,
  BlueskyLoginFailureSavedStore,
} from '../../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { Instant } from '../../../domain/instant/instant.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyLoginFailuresTable } from '../schema.ts';

export const createD1BlueskyLoginFailureResolver = (db: IoriD1Db, scope: string): BlueskyLoginFailureResolver => ({
  resolve: async () => {
    const [row] = await db.select().from(blueskyLoginFailuresTable)
      .where(eq(blueskyLoginFailuresTable.scope, scope)).limit(1);
    return RA.ok(row === undefined ? undefined : row.failedAt.getTime() as Instant);
  },
});

export const createD1BlueskyLoginFailureSavedStore = (db: IoriD1Db, scope: string): BlueskyLoginFailureSavedStore => ({
  save: async (failedAt) => {
    const values = { failedAt: new Date(failedAt) };
    await db.insert(blueskyLoginFailuresTable).values({ scope, ...values }).onConflictDoUpdate({
      target: blueskyLoginFailuresTable.scope,
      set: values,
    });
    return RA.ok(undefined);
  },
});

export const createD1BlueskyLoginFailureDeletedStore = (
  db: IoriD1Db,
  scope: string,
): BlueskyLoginFailureDeletedStore => ({
  delete: async () => {
    await db.delete(blueskyLoginFailuresTable).where(eq(blueskyLoginFailuresTable.scope, scope));
    return RA.ok(undefined);
  },
});
