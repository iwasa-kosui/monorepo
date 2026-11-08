import { RA } from '@iwasa-kosui/result';

import type { BlueskyCrosspostSavedStore } from '../../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyCrosspostsTable } from '../schema.ts';

export const createD1BlueskyCrosspostSavedStore = (db: IoriD1Db): BlueskyCrosspostSavedStore => ({
  save: async (crosspost) => {
    await db.insert(blueskyCrosspostsTable).values({
      ...crosspost,
      createdAt: new Date(crosspost.createdAt),
      updatedAt: new Date(crosspost.updatedAt),
    }).onConflictDoUpdate({
      target: blueskyCrosspostsTable.postId,
      set: {
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
      },
    });
    return RA.ok(undefined);
  },
});
