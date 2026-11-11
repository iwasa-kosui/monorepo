import { RA } from '@iwasa-kosui/result';
import { inArray, sql } from 'drizzle-orm';

import type { BlueskyMutedActorsSyncedStore } from '../../../domain/blueskyTimeline/blueskyMutedActor.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { blueskyMutedActorsTable } from '../schema.ts';

const INSERT_CHUNK_SIZE = 50;

/** 前回から変わった DID だけを書き、ミュートが変わらない実行では SELECT 1 本で終える。 */
export const createD1BlueskyMutedActorsSyncedStore = (db: IoriD1Db): BlueskyMutedActorsSyncedStore => ({
  sync: async (dids) => {
    const next = new Set(dids);
    const stored = new Set(
      (await db.select({ did: blueskyMutedActorsTable.did }).from(blueskyMutedActorsTable)).map((row) => row.did),
    );
    const added = [...next].filter((did) => !stored.has(did));
    const removed = [...stored].filter((did) => !next.has(did));
    if (removed.length > 0) {
      await db.delete(blueskyMutedActorsTable).where(
        inArray(blueskyMutedActorsTable.did, sql`(select value from json_each(${idsJson(removed)}))`),
      );
    }
    for (let start = 0; start < added.length; start += INSERT_CHUNK_SIZE) {
      await db.insert(blueskyMutedActorsTable)
        .values(added.slice(start, start + INSERT_CHUNK_SIZE).map((did) => ({ did })))
        .onConflictDoNothing();
    }
    return RA.ok({ added: added.length, removed: removed.length });
  },
});
