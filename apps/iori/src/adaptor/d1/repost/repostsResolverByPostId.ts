import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { Repost, type RepostsResolverByPostId } from '../../../domain/repost/repost.ts';
import type { IoriD1Db } from '../client.ts';
import { repostsTable } from '../schema.ts';

export const createD1RepostsResolverByPostId = (db: IoriD1Db): RepostsResolverByPostId => ({
  resolve: async ({ postId }) =>
    RA.ok((await db.select().from(repostsTable).where(eq(repostsTable.postId, postId))).map(Repost.orThrow)),
});
