import { RA } from '@iwasa-kosui/result';
import { and, desc, eq, inArray, isNull, lt } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { Instant } from '../../../domain/instant/instant.ts';
import type {
  PostsResolverByActorIds,
  PostsResolverByActorIdWithPagination,
  PostWithAuthor,
} from '../../../domain/post/post.ts';
import type { IoriD1Db } from '../client.ts';
import { localPostsTable, postsTable } from '../schema.ts';
import { createD1ThreadResolver } from './threadResolver.ts';

const resolvePosts = async (
  db: IoriD1Db,
  origin: string,
  input: Readonly<{
    actorIds?: readonly ActorId[];
    localOnly?: boolean;
    createdAt: Instant | undefined;
    limit?: number;
  }>,
): Promise<PostWithAuthor[]> => {
  if (input.actorIds?.length === 0) return [];
  const rows = await db.select({ postId: postsTable.postId })
    .from(postsTable)
    .leftJoin(localPostsTable, eq(postsTable.postId, localPostsTable.postId))
    .where(and(
      isNull(postsTable.deletedAt),
      input.actorIds === undefined ? undefined : inArray(postsTable.actorId, [...input.actorIds]),
      input.localOnly === true ? eq(localPostsTable.postId, postsTable.postId) : undefined,
      input.createdAt === undefined ? undefined : lt(postsTable.createdAt, new Date(input.createdAt)),
    ))
    .orderBy(desc(postsTable.createdAt))
    .limit(input.limit ?? 20);
  const threadResolver = createD1ThreadResolver(db, origin);
  const resolved = await Promise.all(rows.map((row) => threadResolver.resolve({ postId: row.postId as never })));
  return resolved.flatMap((result) => result.ok && result.val.currentPost !== null ? [result.val.currentPost] : []);
};

export const createD1PostsResolverByActorIds = (
  db: IoriD1Db,
  origin: string,
): PostsResolverByActorIds => ({
  resolve: async ({ actorIds, createdAt }) => RA.ok(await resolvePosts(db, origin, { actorIds, createdAt })),
});

export const createD1PostsResolverByActorIdWithPagination = (
  db: IoriD1Db,
  origin: string,
): PostsResolverByActorIdWithPagination => ({
  resolve: async ({ actorId, createdAt }) => RA.ok(await resolvePosts(db, origin, { actorIds: [actorId], createdAt })),
});

export const createD1LocalPostsResolver = (db: IoriD1Db, origin: string) => ({
  resolve: async ({ createdAt, limit }: { createdAt: Instant | undefined; limit?: number }) =>
    RA.ok(await resolvePosts(db, origin, { createdAt, localOnly: true, limit })),
});
