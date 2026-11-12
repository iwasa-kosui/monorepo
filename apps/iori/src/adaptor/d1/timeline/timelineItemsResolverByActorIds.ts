import { RA } from '@iwasa-kosui/result';
import { and, asc, desc, eq, inArray, isNull, lt, notInArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import { ImageId } from '../../../domain/image/imageId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { LinkPreview } from '../../../domain/linkPreview/linkPreview.ts';
import { LinkPreviewId } from '../../../domain/linkPreview/linkPreviewId.ts';
import { LocalPost, RemotePost } from '../../../domain/post/post.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import { Visibility } from '../../../domain/post/visibility.ts';
import { RepostId } from '../../../domain/repost/repostId.ts';
import type {
  PostTimelineItem,
  RepostTimelineItem,
  TimelineItemsResolverByActorIds,
  TimelineItemWithPost,
} from '../../../domain/timeline/timelineItem.ts';
import { TimelineItemId } from '../../../domain/timeline/timelineItemId.ts';
import { Username } from '../../../domain/user/username.ts';
import { actorIdsJson } from '../actorIdsJson.ts';
import type { IoriD1Db } from '../client.ts';
import { pageConditions, pageOrderBy } from '../pageCondition.ts';
import { toVisibility } from '../post/toVisibility.ts';
import { visibleToViewer } from '../post/visibleToViewer.ts';
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
  timelineItemsTable,
  usersTable,
} from '../schema.ts';

const cursorItem = alias(timelineItemsTable, 'cursor_item');

const cursorOf = (id: string) =>
  sql`select ${cursorItem.createdAt}, ${cursorItem.timelineItemId} from ${timelineItemsTable} ${cursorItem}
    where (${cursorItem.type} = 'post' and ${cursorItem.postId} = ${id})
      or (${cursorItem.type} = 'repost' and ${cursorItem.repostId} = ${id})
      or (${cursorItem.type} = 'repost' and ${cursorItem.repostId} is null and ${cursorItem.postId} = ${id})
    order by ${cursorItem.createdAt} desc, ${cursorItem.timelineItemId} desc
    limit 1`;

export const createD1TimelineItemsResolverByActorIds = (
  db: IoriD1Db,
): TimelineItemsResolverByActorIds => ({
  resolve: async ({ actorIds, currentActorId, createdAt, mutedActorIds, page, onlyVisibleToViewer }) => {
    if (actorIds.length === 0) {
      return RA.ok([]);
    }

    const mutedActorIdSet = new Set(mutedActorIds);
    const rows = await db.select()
      .from(timelineItemsTable)
      .innerJoin(postsTable, eq(timelineItemsTable.postId, postsTable.postId))
      .leftJoin(localPostsTable, eq(postsTable.postId, localPostsTable.postId))
      .leftJoin(remotePostsTable, eq(postsTable.postId, remotePostsTable.postId))
      .innerJoin(actorsTable, eq(postsTable.actorId, actorsTable.actorId))
      .leftJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
      .leftJoin(remoteActorsTable, eq(actorsTable.actorId, remoteActorsTable.actorId))
      .leftJoin(usersTable, eq(localActorsTable.userId, usersTable.userId))
      .leftJoin(repostsTable, eq(timelineItemsTable.repostId, repostsTable.repostId))
      .leftJoin(
        likesTable,
        currentActorId === undefined
          ? sql`0`
          : and(eq(likesTable.postId, postsTable.postId), eq(likesTable.actorId, currentActorId)),
      )
      .where(and(
        inArray(timelineItemsTable.actorId, sql`(select value from json_each(${actorIdsJson(actorIds)}))`),
        isNull(timelineItemsTable.deletedAt),
        visibleToViewer({ currentActorId, onlyVisibleToViewer }),
        page === undefined || mutedActorIds.length === 0
          ? undefined
          : notInArray(postsTable.actorId, sql`(select value from json_each(${actorIdsJson([...mutedActorIds])}))`),
        ...(page === undefined
          ? [createdAt === undefined ? undefined : lt(timelineItemsTable.createdAt, new Date(createdAt))]
          : pageConditions(
            page,
            { createdAt: timelineItemsTable.createdAt, id: timelineItemsTable.timelineItemId },
            cursorOf,
          )),
      ))
      .limit(page?.limit ?? 10)
      .orderBy(
        ...(page === undefined
          ? [desc(timelineItemsTable.createdAt), desc(timelineItemsTable.timelineItemId)]
          : pageOrderBy(page, { createdAt: timelineItemsTable.createdAt, id: timelineItemsTable.timelineItemId })),
      );

    const postIds = rows.map((row) => row.posts.postId);
    const reposterActorIds = rows
      .filter((row) => row.timeline_items.type === 'repost')
      .map((row) => row.timeline_items.actorId);
    const [imageRows, repostRows, likeCounts, repostCounts, reactions, linkPreviews, reposters] = await Promise.all([
      postIds.length === 0
        ? Promise.resolve([])
        : db.select()
          .from(postImagesTable)
          .where(inArray(postImagesTable.postId, postIds))
          .orderBy(asc(postImagesTable.createdAt), asc(postImagesTable.imageId)),
      currentActorId !== undefined && postIds.length > 0
        ? db.select({ postId: repostsTable.postId })
          .from(repostsTable)
          .where(and(
            eq(repostsTable.actorId, currentActorId),
            inArray(repostsTable.postId, postIds),
          ))
        : Promise.resolve([]),
      postIds.length === 0
        ? Promise.resolve([])
        : db.select({ postId: likesTable.postId, count: sql<number>`count(*)` })
          .from(likesTable).where(inArray(likesTable.postId, postIds)).groupBy(likesTable.postId),
      postIds.length === 0
        ? Promise.resolve([])
        : db.select({ postId: repostsTable.postId, count: sql<number>`count(*)` })
          .from(repostsTable).where(inArray(repostsTable.postId, postIds)).groupBy(repostsTable.postId),
      postIds.length === 0
        ? Promise.resolve([])
        : db.select({
          postId: emojiReactsTable.postId,
          emoji: emojiReactsTable.emoji,
          emojiImageUrl: sql<string | null>`max(${emojiReactsTable.emojiImageUrl})`,
          count: sql<number>`count(*)`,
        }).from(emojiReactsTable).where(inArray(emojiReactsTable.postId, postIds))
          .groupBy(emojiReactsTable.postId, emojiReactsTable.emoji),
      postIds.length === 0
        ? Promise.resolve([])
        : db.select().from(linkPreviewsTable).where(inArray(linkPreviewsTable.postId, postIds)),
      reposterActorIds.length > 0
        ? db.select()
          .from(actorsTable)
          .leftJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
          .leftJoin(remoteActorsTable, eq(actorsTable.actorId, remoteActorsTable.actorId))
          .leftJoin(usersTable, eq(localActorsTable.userId, usersTable.userId))
          .where(inArray(actorsTable.actorId, reposterActorIds))
        : Promise.resolve([]),
    ]);

    const imagesByPostId = new Map<
      string,
      { imageId: ImageId; url: string; altText: string | null; mediaType: string | null }[]
    >();
    for (const image of imageRows) {
      const images = imagesByPostId.get(image.postId) ?? [];
      images.push({
        imageId: ImageId.orThrow(image.imageId),
        url: image.url,
        altText: image.altText,
        mediaType: image.mediaType,
      });
      imagesByPostId.set(image.postId, images);
    }

    const repostedPostIds = new Set<string>();
    for (const repost of repostRows) {
      repostedPostIds.add(repost.postId);
    }

    const likeCountsByPostId = new Map<string, number>();
    const repostCountsByPostId = new Map<string, number>();
    const reactionsByPostId = new Map<string, { emoji: string; count: number; emojiImageUrl: string | null }[]>();
    const linkPreviewsByPostId = new Map<string, LinkPreview[]>();
    for (const count of likeCounts) likeCountsByPostId.set(count.postId, Number(count.count));
    for (const count of repostCounts) repostCountsByPostId.set(count.postId, Number(count.count));
    for (const reaction of reactions) {
      const postReactions = reactionsByPostId.get(reaction.postId) ?? [];
      postReactions.push({
        emoji: reaction.emoji,
        count: Number(reaction.count),
        emojiImageUrl: reaction.emojiImageUrl,
      });
      reactionsByPostId.set(reaction.postId, postReactions);
    }
    for (const preview of linkPreviews) {
      const postPreviews = linkPreviewsByPostId.get(preview.postId) ?? [];
      postPreviews.push(LinkPreview.orThrow({
        linkPreviewId: LinkPreviewId.orThrow(preview.linkPreviewId),
        postId: preview.postId as PostId,
        url: preview.url,
        title: preview.title,
        description: preview.description,
        imageUrl: preview.imageUrl,
        faviconUrl: preview.faviconUrl,
        siteName: preview.siteName,
        createdAt: preview.createdAt.getTime(),
      }));
      linkPreviewsByPostId.set(preview.postId, postPreviews);
    }

    const reposterInfo = new Map<string, { username: string | undefined; logoUri: string | undefined }>();
    for (const reposter of reposters) {
      reposterInfo.set(reposter.actors.actorId, {
        username: reposter.users?.username ?? reposter.remote_actors?.username ?? undefined,
        logoUri: reposter.actors.logoUri ?? undefined,
      });
    }

    const timelineItems: TimelineItemWithPost[] = rows
      .filter((row) => !mutedActorIdSet.has(row.posts.actorId as ActorId))
      .map((row) => {
        const post = row.local_posts !== null
          ? LocalPost.orThrow({
            postId: row.posts.postId,
            actorId: row.posts.actorId,
            content: row.posts.content,
            createdAt: row.posts.createdAt.getTime(),
            userId: row.local_posts.userId,
            inReplyToUri: row.local_posts.inReplyToUri,
            summary: row.posts.summary,
            sensitive: row.posts.sensitive,
            visibility: Visibility.parseOrThrow(row.local_posts.visibility),
            editedAt: row.local_posts.editedAt?.getTime(),
            type: 'local',
          })
          : row.remote_posts !== null
          ? RemotePost.orThrow({
            postId: row.posts.postId,
            uri: row.remote_posts.uri,
            actorId: row.posts.actorId,
            content: row.posts.content,
            createdAt: row.posts.createdAt.getTime(),
            inReplyToUri: row.remote_posts.inReplyToUri,
            visibility: toVisibility(row.remote_posts.visibility),
            editedAt: row.remote_posts.editedAt?.getTime() ?? null,
            summary: row.posts.summary,
            sensitive: row.posts.sensitive,
            type: 'remote',
          })
          : (() => {
            throw new Error(`Post type could not be determined for postId: ${row.posts.postId}`);
          })();
        const username = row.local_posts !== null ? row.users?.username : row.remote_actors?.username;
        if (username === null || username === undefined) {
          throw new Error(`Post author could not be determined for postId: ${row.posts.postId}`);
        }
        const postWithAuthor = {
          ...post,
          username: Username.orThrow(username),
          logoUri: row.actors.logoUri ?? undefined,
          liked: row.likes !== null,
          reposted: repostedPostIds.has(row.posts.postId),
          images: imagesByPostId.get(row.posts.postId) ?? [],
          likeCount: likeCountsByPostId.get(row.posts.postId) ?? 0,
          repostCount: repostCountsByPostId.get(row.posts.postId) ?? 0,
          reactions: reactionsByPostId.get(row.posts.postId) ?? [],
          linkPreviews: linkPreviewsByPostId.get(row.posts.postId) ?? [],
        };
        const timelineItemId = TimelineItemId.orThrow(row.timeline_items.timelineItemId);
        const itemCreatedAt = row.timeline_items.createdAt.getTime() as Instant;
        if (row.timeline_items.type === 'repost') {
          const reposter = reposterInfo.get(row.timeline_items.actorId);
          const repostId = row.timeline_items.repostId;
          if (reposter !== undefined && repostId !== null) {
            const item: RepostTimelineItem = {
              type: 'repost',
              timelineItemId,
              repostId: RepostId.orThrow(repostId),
              post: postWithAuthor,
              repostedBy: {
                actorId: row.timeline_items.actorId as ActorId,
                username: reposter.username,
                logoUri: reposter.logoUri,
              },
              createdAt: itemCreatedAt,
            };
            return item;
          }
        }
        const item: PostTimelineItem = {
          type: 'post',
          timelineItemId,
          post: postWithAuthor,
          createdAt: itemCreatedAt,
        };
        return item;
      });

    return RA.ok(timelineItems);
  },
});
