import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type {
  BlueskyCrosspost,
  BlueskyCrosspostSavedStore,
} from '../../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyCrosspostsTable } from '../schema.ts';

const mutableColumnsOf = (crosspost: BlueskyCrosspost) => ({
  status: crosspost.status,
  skipReason: crosspost.skipReason,
  uri: crosspost.uri,
  cid: crosspost.cid,
  rkey: crosspost.rkey,
  rootUri: crosspost.rootUri,
  rootCid: crosspost.rootCid,
  attempts: crosspost.attempts,
  lastError: crosspost.lastError,
  updatedAt: new Date(crosspost.updatedAt),
});

export const createD1BlueskyCrosspostSavedStore = (db: IoriD1Db): BlueskyCrosspostSavedStore => ({
  save: async (crosspost) => {
    await db.insert(blueskyCrosspostsTable).values({
      ...crosspost,
      createdAt: new Date(crosspost.createdAt),
      updatedAt: new Date(crosspost.updatedAt),
    }).onConflictDoUpdate({
      target: blueskyCrosspostsTable.postId,
      set: mutableColumnsOf(crosspost),
    });
    return RA.ok(undefined);
  },
  update: async (crosspost) => {
    const updated = await db.update(blueskyCrosspostsTable).set(mutableColumnsOf(crosspost))
      .where(eq(blueskyCrosspostsTable.postId, crosspost.postId))
      .returning({ postId: blueskyCrosspostsTable.postId });
    return RA.ok(updated.length > 0);
  },
});
