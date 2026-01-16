import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull } from 'drizzle-orm';

import type { PostResolver } from '../../../domain/post/post.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { localPostsTable, postsTable, remotePostsTable } from '../schema.ts';
import { reconstructPost } from './reconstruct.ts';

const getInstance = singleton((): PostResolver => {
  const resolve = async (postId: PostId) => {
    const [row, ...rest] = await DB.getInstance().select()
      .from(postsTable)
      .leftJoin(
        localPostsTable,
        eq(postsTable.postId, localPostsTable.postId),
      )
      .leftJoin(
        remotePostsTable,
        eq(postsTable.postId, remotePostsTable.postId),
      )
      .where(and(eq(postsTable.postId, postId), isNull(postsTable.deletedAt)))
      .execute();

    if (!row) {
      return RA.ok(undefined);
    }
    if (rest.length > 0) {
      throw new Error(`Multiple posts found with the same ID: ${postId}`);
    }

    return RA.ok(reconstructPost(row));
  };
  return { resolve };
});

export const PgPostResolver = {
  getInstance,
} as const;
