import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull } from 'drizzle-orm';

import type { Agg } from '../../../domain/aggregate/index.ts';
import type { RemotePost } from '../../../domain/post/post.ts';
import { RemotePost as RemotePostSchema } from '../../../domain/post/post.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { postsTable, remotePostsTable } from '../schema.ts';

export type PostResolverByUri = Agg.Resolver<
  { uri: string },
  RemotePost | undefined
>;

const getInstance = singleton((): PostResolverByUri => {
  const resolve = async ({ uri }: { uri: string }) => {
    const [row] = await DB.getInstance().select()
      .from(postsTable)
      .innerJoin(
        remotePostsTable,
        eq(postsTable.postId, remotePostsTable.postId),
      )
      .where(and(eq(remotePostsTable.uri, uri), isNull(postsTable.deletedAt)))
      .execute();

    if (!row) {
      return RA.ok(undefined);
    }

    return RA.ok(RemotePostSchema.orThrow({
      postId: row.posts.postId,
      actorId: row.posts.actorId,
      content: row.posts.content,
      createdAt: row.posts.createdAt.getTime(),
      uri: row.remote_posts.uri,
      inReplyToUri: row.remote_posts.inReplyToUri,
      type: 'remote',
    }));
  };
  return { resolve };
});

export const PgPostResolverByUri = {
  getInstance,
} as const;
