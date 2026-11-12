import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { PostSourceTextResolver } from '../../../domain/post/post.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { localPostsTable } from '../schema.ts';

export const createD1PostSourceTextResolver = (db: IoriD1Db): PostSourceTextResolver => ({
  resolve: (postId) =>
    RA.flow(
      fromD1(async () => {
        const [row] = await db.select({ sourceText: localPostsTable.sourceText }).from(localPostsTable)
          .where(eq(localPostsTable.postId, postId));
        return row?.sourceText ?? null;
      }),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
