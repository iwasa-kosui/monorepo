import { RA } from '@iwasa-kosui/result';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import { ImageId } from '../../../domain/image/imageId.ts';
import { LinkPreview } from '../../../domain/linkPreview/linkPreview.ts';
import { LinkPreviewId } from '../../../domain/linkPreview/linkPreviewId.ts';
import {
  LocalPost,
  type PostsWithAuthorResolverByPostIds,
  type PostWithAuthor,
  RemotePost,
} from '../../../domain/post/post.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import { Username } from '../../../domain/user/username.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import {
  actorsTable,
  emojiReactsTable,
  likesTable,
  linkPreviewsTable,
  localActorsTable,
  localPostsTable,
  postImagesTable,
  postsTable,
  remoteActorsTable,
  remotePostsTable,
  repostsTable,
  usersTable,
} from '../schema.ts';
import { toVisibility } from './toVisibility.ts';
import { visibleToViewer } from './visibleToViewer.ts';

export type PostRow = {
  posts: typeof postsTable.$inferSelect;
  local_posts: typeof localPostsTable.$inferSelect | null;
  remote_posts: typeof remotePostsTable.$inferSelect | null;
  actors: typeof actorsTable.$inferSelect;
  local_actors: typeof localActorsTable.$inferSelect | null;
  remote_actors: typeof remoteActorsTable.$inferSelect | null;
  users: typeof usersTable.$inferSelect | null;
};

export const postRowsQuery = (db: IoriD1Db) =>
  db.select().from(postsTable)
    .leftJoin(localPostsTable, eq(postsTable.postId, localPostsTable.postId))
    .leftJoin(remotePostsTable, eq(postsTable.postId, remotePostsTable.postId))
    .innerJoin(actorsTable, eq(postsTable.actorId, actorsTable.actorId))
    .leftJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
    .leftJoin(remoteActorsTable, eq(actorsTable.actorId, remoteActorsTable.actorId))
    .leftJoin(usersTable, eq(localActorsTable.userId, usersTable.userId));

const groupBy = <T, K>(items: ReadonlyArray<T>, keyOf: (item: T) => K): Map<K, T[]> => {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [item]);
    else group.push(item);
  }
  return groups;
};

export const enrichPostRows = async (
  db: IoriD1Db,
  rows: ReadonlyArray<PostRow>,
  currentActorId: ActorId | undefined,
): Promise<PostWithAuthor[]> => {
  if (rows.length === 0) return [];
  const postIdSelection = sql`(select value from json_each(${idsJson(rows.map((row) => row.posts.postId))}))`;
  const [images, likeCounts, repostCounts, reactions, previews, myLikes, myReposts] = await Promise.all([
    db.select().from(postImagesTable)
      .where(inArray(postImagesTable.postId, postIdSelection))
      .orderBy(asc(postImagesTable.createdAt), asc(postImagesTable.imageId)),
    db.select({ postId: likesTable.postId, count: sql<number>`count(*)` })
      .from(likesTable).where(inArray(likesTable.postId, postIdSelection)).groupBy(likesTable.postId),
    db.select({ postId: repostsTable.postId, count: sql<number>`count(*)` })
      .from(repostsTable).where(inArray(repostsTable.postId, postIdSelection)).groupBy(repostsTable.postId),
    db.select({
      postId: emojiReactsTable.postId,
      emoji: emojiReactsTable.emoji,
      emojiImageUrl: emojiReactsTable.emojiImageUrl,
      count: sql<number>`count(*)`,
    }).from(emojiReactsTable)
      .where(inArray(emojiReactsTable.postId, postIdSelection))
      .groupBy(emojiReactsTable.postId, emojiReactsTable.emoji, emojiReactsTable.emojiImageUrl),
    db.select().from(linkPreviewsTable).where(inArray(linkPreviewsTable.postId, postIdSelection)),
    currentActorId === undefined
      ? Promise.resolve([])
      : db.select({ postId: likesTable.postId }).from(likesTable)
        .where(and(eq(likesTable.actorId, currentActorId), inArray(likesTable.postId, postIdSelection))),
    currentActorId === undefined
      ? Promise.resolve([])
      : db.select({ postId: repostsTable.postId }).from(repostsTable)
        .where(and(eq(repostsTable.actorId, currentActorId), inArray(repostsTable.postId, postIdSelection))),
  ]);

  const imagesByPostId = groupBy(images, (image) => image.postId);
  const reactionsByPostId = groupBy(reactions, (reaction) => reaction.postId);
  const previewsByPostId = groupBy(previews, (preview) => preview.postId);
  const likeCountByPostId = new Map(likeCounts.map((row) => [row.postId, Number(row.count)]));
  const repostCountByPostId = new Map(repostCounts.map((row) => [row.postId, Number(row.count)]));
  const likedPostIds = new Set(myLikes.map((row) => row.postId));
  const repostedPostIds = new Set(myReposts.map((row) => row.postId));

  return rows.map((row): PostWithAuthor => {
    const postId = row.posts.postId;
    const common = {
      username: Username.orThrow(row.users?.username ?? row.remote_actors?.username ?? 'unknown'),
      logoUri: row.actors.logoUri ?? undefined,
      liked: likedPostIds.has(postId),
      reposted: repostedPostIds.has(postId),
      images: (imagesByPostId.get(postId) ?? []).map(({ imageId, url, altText }) => ({
        imageId: ImageId.orThrow(imageId),
        url,
        altText,
      })),
      likeCount: likeCountByPostId.get(postId) ?? 0,
      repostCount: repostCountByPostId.get(postId) ?? 0,
      reactions: (reactionsByPostId.get(postId) ?? []).map(({ emoji, emojiImageUrl, count }) => ({
        emoji,
        emojiImageUrl,
        count: Number(count),
      })),
      linkPreviews: (previewsByPostId.get(postId) ?? []).map((preview) =>
        LinkPreview.orThrow({
          ...preview,
          linkPreviewId: LinkPreviewId.orThrow(preview.linkPreviewId),
          postId: preview.postId as PostId,
          createdAt: preview.createdAt.getTime(),
        })
      ),
    };
    if (row.local_posts !== null) {
      return {
        ...LocalPost.orThrow({
          ...row.posts,
          ...row.local_posts,
          type: 'local',
          createdAt: row.posts.createdAt.getTime(),
        }),
        ...common,
      };
    }
    if (row.remote_posts !== null) {
      return {
        ...RemotePost.orThrow({
          ...row.posts,
          ...row.remote_posts,
          visibility: toVisibility(row.remote_posts.visibility),
          type: 'remote',
          createdAt: row.posts.createdAt.getTime(),
        }),
        ...common,
      };
    }
    throw new Error(`Post type could not be determined for ${postId}`);
  });
};

export const resolvePostsWithAuthorByIds = async (
  db: IoriD1Db,
  postIds: ReadonlyArray<PostId>,
  currentActorId: ActorId | undefined,
  onlyVisibleToViewer?: boolean,
): Promise<ReadonlyMap<PostId, PostWithAuthor>> => {
  if (postIds.length === 0) return new Map();
  const rows = await postRowsQuery(db).where(and(
    isNull(postsTable.deletedAt),
    inArray(postsTable.postId, sql`(select value from json_each(${idsJson(postIds)}))`),
    visibleToViewer({ currentActorId, onlyVisibleToViewer }),
  ));
  const posts = await enrichPostRows(db, rows, currentActorId);
  return new Map(posts.map((post) => [post.postId, post]));
};

export const createD1PostsWithAuthorResolverByPostIds = (db: IoriD1Db): PostsWithAuthorResolverByPostIds => ({
  resolve: async ({ postIds, currentActorId, onlyVisibleToViewer }) =>
    RA.ok(await resolvePostsWithAuthorByIds(db, postIds, currentActorId, onlyVisibleToViewer)),
});
