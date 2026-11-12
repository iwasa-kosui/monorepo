import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import {
  BlueskySession,
  type BlueskySessionDeletedStore,
  type BlueskySessionResolver,
  type BlueskySessionSavedStore,
} from '../../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskySessionsTable } from '../schema.ts';

export const BLUESKY_SESSION_ID = 'default';

export const createD1BlueskySessionResolver = (db: IoriD1Db): BlueskySessionResolver => ({
  resolve: async () => {
    const [row] = await db.select().from(blueskySessionsTable)
      .where(eq(blueskySessionsTable.id, BLUESKY_SESSION_ID)).limit(1);
    return RA.ok(
      row === undefined ? undefined : BlueskySession.orThrow({
        did: row.did,
        handle: row.handle,
        pdsUrl: row.pdsUrl,
        accessJwt: row.accessJwt,
        refreshJwt: row.refreshJwt,
        updatedAt: row.updatedAt.getTime() as BlueskySession['updatedAt'],
      }),
    );
  },
});

export const blueskySessionSaveQuery = (db: IoriD1Db, session: BlueskySession) => {
  const values = { ...session, updatedAt: new Date(session.updatedAt) };
  return db.insert(blueskySessionsTable).values({ id: BLUESKY_SESSION_ID, ...values }).onConflictDoUpdate({
    target: blueskySessionsTable.id,
    set: values,
  });
};

export const blueskySessionDeleteQuery = (db: IoriD1Db) =>
  db.delete(blueskySessionsTable).where(eq(blueskySessionsTable.id, BLUESKY_SESSION_ID));

export const createD1BlueskySessionSavedStore = (db: IoriD1Db): BlueskySessionSavedStore => ({
  save: async (session) => {
    await blueskySessionSaveQuery(db, session);
    return RA.ok(undefined);
  },
});

export const createD1BlueskySessionDeletedStore = (db: IoriD1Db): BlueskySessionDeletedStore => ({
  delete: async () => {
    await blueskySessionDeleteQuery(db);
    return RA.ok(undefined);
  },
});
