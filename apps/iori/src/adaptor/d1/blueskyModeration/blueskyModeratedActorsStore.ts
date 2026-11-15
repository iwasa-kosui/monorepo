import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type {
  BlueskyBlockDeletedStore,
  BlueskyBlockSavedStore,
  BlueskyMuteDeletedStore,
  BlueskyMuteSavedStore,
} from '../../../domain/blueskyModeration/blueskyModeration.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyModeratedActorsTable } from '../schema.ts';

export const createD1BlueskyMuteSavedStore = (db: IoriD1Db, userId: UserId): BlueskyMuteSavedStore => ({
  save: async (did, at) => {
    const values = { muted: 1, updatedAt: new Date(at) };
    await db.insert(blueskyModeratedActorsTable).values({ userId, did, ...values }).onConflictDoUpdate({
      target: [blueskyModeratedActorsTable.userId, blueskyModeratedActorsTable.did],
      set: values,
    });
    return RA.ok(undefined);
  },
});

export const createD1BlueskyMuteDeletedStore = (db: IoriD1Db, userId: UserId): BlueskyMuteDeletedStore => ({
  delete: async (did, at) => {
    await db.update(blueskyModeratedActorsTable)
      .set({ muted: 0, updatedAt: new Date(at) })
      .where(and(eq(blueskyModeratedActorsTable.userId, userId), eq(blueskyModeratedActorsTable.did, did)));
    return RA.ok(undefined);
  },
});

export const createD1BlueskyBlockSavedStore = (db: IoriD1Db, userId: UserId): BlueskyBlockSavedStore => ({
  save: async (did, blockUri, at) => {
    const values = { blockUri, updatedAt: new Date(at) };
    await db.insert(blueskyModeratedActorsTable).values({ userId, did, ...values }).onConflictDoUpdate({
      target: [blueskyModeratedActorsTable.userId, blueskyModeratedActorsTable.did],
      set: values,
    });
    return RA.ok(undefined);
  },
});

export const createD1BlueskyBlockDeletedStore = (db: IoriD1Db, userId: UserId): BlueskyBlockDeletedStore => ({
  delete: async (did, at) => {
    await db.update(blueskyModeratedActorsTable)
      .set({ blockUri: null, updatedAt: new Date(at) })
      .where(and(eq(blueskyModeratedActorsTable.userId, userId), eq(blueskyModeratedActorsTable.did, did)));
    return RA.ok(undefined);
  },
});
