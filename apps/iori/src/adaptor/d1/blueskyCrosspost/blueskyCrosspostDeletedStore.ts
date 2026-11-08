import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { BlueskyCrosspostDeletedStore } from '../../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyCrosspostsTable } from '../schema.ts';

export const createD1BlueskyCrosspostDeletedStore = (db: IoriD1Db): BlueskyCrosspostDeletedStore => ({
  delete: async (postId) => {
    await db.delete(blueskyCrosspostsTable).where(eq(blueskyCrosspostsTable.postId, postId));
    return RA.ok(undefined);
  },
});
