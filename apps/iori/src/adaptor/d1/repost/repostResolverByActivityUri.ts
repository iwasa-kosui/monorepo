import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { Repost, type RepostResolverByActivityUri } from '../../../domain/repost/repost.ts';
import type { IoriD1Db } from '../client.ts';
import { repostsTable } from '../schema.ts';

export const createD1RepostResolverByActivityUri = (db: IoriD1Db): RepostResolverByActivityUri => ({
  resolve: async ({ announceActivityUri }) => {
    const [row] = await db.select().from(repostsTable).where(eq(repostsTable.announceActivityUri, announceActivityUri))
      .limit(1);
    return RA.ok(row === undefined ? undefined : Repost.orThrow(row));
  },
});
