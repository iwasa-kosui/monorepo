import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull } from 'drizzle-orm';

import type { Agg } from '../../../domain/aggregate/index.ts';
import type { LocalPost } from '../../../domain/post/post.ts';
import { LocalPost as LocalPostSchema } from '../../../domain/post/post.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { localPostsTable, postsTable } from '../schema.ts';

export type LocalPostResolverByUri = Agg.Resolver<
  { uri: string },
  LocalPost | undefined
>;

const getInstance = singleton((): LocalPostResolverByUri => {
  const resolve = async ({ uri }: { uri: string }) => {
    // Local post URIs look like: https://example.com/users/{username}/posts/{postId}
    const postIdMatch = uri.match(/\/posts\/([a-f0-9-]+)$/i);
    if (!postIdMatch) {
      return RA.ok(undefined);
    }

    const postId = postIdMatch[1];
    const [row] = await DB.getInstance()
      .select()
      .from(postsTable)
      .innerJoin(localPostsTable, eq(postsTable.postId, localPostsTable.postId))
      .where(and(eq(localPostsTable.postId, postId), isNull(postsTable.deletedAt)))
      .execute();

    if (!row) {
      return RA.ok(undefined);
    }

    return RA.ok(
      LocalPostSchema.orThrow({
        postId: row.posts.postId,
        actorId: row.posts.actorId,
        content: row.posts.content,
        createdAt: row.posts.createdAt.getTime(),
        userId: row.local_posts.userId,
        inReplyToUri: row.local_posts.inReplyToUri,
        type: 'local',
      }),
    );
  };
  return { resolve };
});

export const PgLocalPostResolverByUri = {
  getInstance,
} as const;
