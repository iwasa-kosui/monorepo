import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { BlueskyCrosspostResolver } from '../../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyCrosspostsTable } from '../schema.ts';
import { toBlueskyCrosspost } from './blueskyCrosspostRow.ts';

export const createD1BlueskyCrosspostResolver = (db: IoriD1Db): BlueskyCrosspostResolver => ({
  resolve: async (postId) => {
    const [row] = await db.select().from(blueskyCrosspostsTable).where(eq(blueskyCrosspostsTable.postId, postId))
      .limit(1);
    return RA.ok(row === undefined ? undefined : toBlueskyCrosspost(row));
  },
});
