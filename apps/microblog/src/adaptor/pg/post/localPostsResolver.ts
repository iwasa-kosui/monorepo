import { RA } from '@iwasa-kosui/result';
import { and, desc, eq, inArray, isNull, lt } from 'drizzle-orm';

import type { Agg } from '../../../domain/aggregate/index.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { LocalPost, type PostImage, type PostQuery } from '../../../domain/post/post.ts';
import { Username } from '../../../domain/user/username.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { actorsTable, localActorsTable, localPostsTable, postImagesTable, postsTable, usersTable } from '../schema.ts';

export type LocalPostsResolver = Agg.Resolver<
  { createdAt: Instant | undefined; limit?: number },
  PostQuery[]
>;

const getInstance = singleton((): LocalPostsResolver => {
  const resolve = async ({ createdAt, limit = 20 }: { createdAt: Instant | undefined; limit?: number }) => {
    const rows = await DB.getInstance()
      .select()
      .from(postsTable)
      .innerJoin(localPostsTable, eq(postsTable.postId, localPostsTable.postId))
      .innerJoin(actorsTable, eq(postsTable.actorId, actorsTable.actorId))
      .innerJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
      .innerJoin(usersTable, eq(localActorsTable.userId, usersTable.userId))
      .where(
        and(
          eq(postsTable.type, 'local'),
          isNull(postsTable.deletedAt),
          createdAt ? lt(postsTable.createdAt, Instant.toDate(createdAt)) : undefined,
        ),
      )
      .limit(limit)
      .orderBy(desc(postsTable.createdAt))
      .execute();

    const postIds = rows.map((row) => row.posts.postId);
    const imageRows = postIds.length > 0
      ? await DB.getInstance()
        .select()
        .from(postImagesTable)
        .where(inArray(postImagesTable.postId, postIds))
        .execute()
      : [];

    const imagesByPostId = new Map<string, PostImage[]>();
    for (const imageRow of imageRows) {
      const existing = imagesByPostId.get(imageRow.postId) ?? [];
      existing.push({ url: imageRow.url, altText: imageRow.altText });
      imagesByPostId.set(imageRow.postId, existing);
    }

    return RA.ok(
      rows.map((row) => {
        const images = imagesByPostId.get(row.posts.postId) ?? [];
        const post: LocalPost = LocalPost.orThrow({
          postId: row.posts.postId,
          actorId: row.posts.actorId,
          content: row.posts.content,
          createdAt: row.posts.createdAt.getTime(),
          userId: row.local_posts.userId,
          inReplyToUri: row.local_posts.inReplyToUri,
          type: 'local',
        });
        return {
          ...post,
          username: Username.orThrow(row.users.username),
          logoUri: row.actors.logoUri ?? undefined,
          liked: false,
          reposted: false,
          images,
          likeCount: 0,
          repostCount: 0,
          reactionCounts: [],
        };
      }),
    );
  };
  return { resolve };
});

export const PgLocalPostsResolver = {
  getInstance,
} as const;
