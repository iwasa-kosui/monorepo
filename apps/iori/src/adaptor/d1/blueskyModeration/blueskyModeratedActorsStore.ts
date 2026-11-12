import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type {
  BlueskyBlockDeletedStore,
  BlueskyBlockSavedStore,
  BlueskyMuteDeletedStore,
  BlueskyMuteSavedStore,
} from '../../../domain/blueskyModeration/blueskyModeration.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyModeratedActorsTable } from '../schema.ts';

export const createD1BlueskyMuteSavedStore = (db: IoriD1Db): BlueskyMuteSavedStore => ({
  save: async (did, at) => {
    const values = { muted: 1, updatedAt: new Date(at) };
    await db.insert(blueskyModeratedActorsTable).values({ did, ...values }).onConflictDoUpdate({
      target: blueskyModeratedActorsTable.did,
      set: values,
    });
    return RA.ok(undefined);
  },
});

export const createD1BlueskyMuteDeletedStore = (db: IoriD1Db): BlueskyMuteDeletedStore => ({
  delete: async (did, at) => {
    await db.update(blueskyModeratedActorsTable)
      .set({ muted: 0, updatedAt: new Date(at) })
      .where(eq(blueskyModeratedActorsTable.did, did));
    return RA.ok(undefined);
  },
});

export const createD1BlueskyBlockSavedStore = (db: IoriD1Db): BlueskyBlockSavedStore => ({
  save: async (did, blockUri, at) => {
    const values = { blockUri, updatedAt: new Date(at) };
    await db.insert(blueskyModeratedActorsTable).values({ did, ...values }).onConflictDoUpdate({
      target: blueskyModeratedActorsTable.did,
      set: values,
    });
    return RA.ok(undefined);
  },
});

export const createD1BlueskyBlockDeletedStore = (db: IoriD1Db): BlueskyBlockDeletedStore => ({
  delete: async (did, at) => {
    await db.update(blueskyModeratedActorsTable)
      .set({ blockUri: null, updatedAt: new Date(at) })
      .where(eq(blueskyModeratedActorsTable.did, did));
    return RA.ok(undefined);
  },
});
