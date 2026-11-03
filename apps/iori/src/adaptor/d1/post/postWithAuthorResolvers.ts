import { RA } from '@iwasa-kosui/result';
import { and, desc, inArray, isNull, lt, sql } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { Instant } from '../../../domain/instant/instant.ts';
import type {
  PostsResolverByActorIds,
  PostsResolverByActorIdWithPagination,
  PostWithAuthor,
} from '../../../domain/post/post.ts';
import { actorIdsJson } from '../actorIdsJson.ts';
import type { IoriD1Db } from '../client.ts';
import { postsTable } from '../schema.ts';
import { enrichPostRows, postRowsQuery } from './postWithAuthorBatch.ts';

const resolvePosts = async (
  db: IoriD1Db,
  input: Readonly<{
    actorIds?: readonly ActorId[];
    currentActorId?: ActorId;
    createdAt: Instant | undefined;
  }>,
): Promise<PostWithAuthor[]> => {
  if (input.actorIds?.length === 0) return [];
  const rows = await postRowsQuery(db)
    .where(and(
      isNull(postsTable.deletedAt),
      input.actorIds === undefined
        ? undefined
        : inArray(postsTable.actorId, sql`(select value from json_each(${actorIdsJson(input.actorIds)}))`),
      input.createdAt === undefined ? undefined : lt(postsTable.createdAt, new Date(input.createdAt)),
    ))
    .orderBy(desc(postsTable.createdAt))
    .limit(20);
  return enrichPostRows(db, rows, input.currentActorId);
};

export const createD1PostsResolverByActorIds = (
  db: IoriD1Db,
  _origin: string,
): PostsResolverByActorIds => ({
  resolve: async ({ actorIds, currentActorId, createdAt }) =>
    RA.ok(await resolvePosts(db, { actorIds, currentActorId, createdAt })),
});

export const createD1PostsResolverByActorIdWithPagination = (
  db: IoriD1Db,
  _origin: string,
): PostsResolverByActorIdWithPagination => ({
  resolve: async ({ actorId, currentActorId, createdAt }) =>
    RA.ok(await resolvePosts(db, { actorIds: [actorId], currentActorId, createdAt })),
});
