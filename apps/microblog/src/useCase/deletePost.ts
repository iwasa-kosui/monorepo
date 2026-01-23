import { Article as FedifyArticle, Delete, Note, type RequestContext, Tombstone } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import { Article, type ArticleDeletedStore, type ArticleResolverByRootPostId } from '../domain/article/article.ts';
import {
  EmojiReact,
  type EmojiReactDeletedStore,
  type EmojiReactsResolverByPostId,
} from '../domain/emojiReact/emojiReact.ts';
import { Instant } from '../domain/instant/instant.ts';
import { Like, type LikeDeletedStore, type LikesResolverByPostId } from '../domain/like/like.ts';
import {
  type EmojiReactNotificationDeletedStore,
  type EmojiReactNotificationsResolverByPostId,
  type LikeNotificationDeletedStore,
  type LikeNotificationsResolverByPostId,
  Notification,
  type ReplyNotificationDeletedStore,
  type ReplyNotificationsResolverByOriginalPostId,
  type ReplyNotificationsResolverByReplyPostId,
} from '../domain/notification/notification.ts';
import { Post, type PostDeletedStore, PostNotFoundError, type PostResolver } from '../domain/post/post.ts';
import { PostId } from '../domain/post/postId.ts';
import { Repost, type RepostDeletedStore, type RepostsResolverByPostId } from '../domain/repost/repost.ts';
import { SessionExpiredError, type SessionResolver } from '../domain/session/session.ts';
import { SessionId } from '../domain/session/sessionId.ts';
import {
  TimelineItem,
  type TimelineItemDeletedStore,
  type TimelineItemResolverByPostId,
} from '../domain/timeline/timelineItem.ts';
import { UserNotFoundError, type UserResolver } from '../domain/user/user.ts';
import { Schema } from '../helper/schema.ts';
import { resolveLocalActorWith, resolveSessionWith, resolveUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  sessionId: SessionId;
  postId: PostId;
  ctx: RequestContext<unknown>;
}>;

const Ok = Schema.create(
  z.object({
    success: z.boolean(),
  }),
);
type Ok = z.infer<typeof Ok.zodType>;

type UnauthorizedError = Readonly<{
  type: 'UnauthorizedError';
  message: string;
}>;

const UnauthorizedError = {
  create: (): UnauthorizedError => ({
    type: 'UnauthorizedError',
    message: 'You are not authorized to delete this post.',
  }),
} as const;

type Err = SessionExpiredError | UserNotFoundError | PostNotFoundError | UnauthorizedError;

export type DeletePostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  postDeletedStore: PostDeletedStore;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  postResolver: PostResolver;
  timelineItemDeletedStore: TimelineItemDeletedStore;
  timelineItemResolverByPostId: TimelineItemResolverByPostId;
  likeNotificationDeletedStore: LikeNotificationDeletedStore;
  likeNotificationsResolverByPostId: LikeNotificationsResolverByPostId;
  emojiReactNotificationDeletedStore: EmojiReactNotificationDeletedStore;
  emojiReactNotificationsResolverByPostId: EmojiReactNotificationsResolverByPostId;
  replyNotificationDeletedStore: ReplyNotificationDeletedStore;
  replyNotificationsResolverByReplyPostId: ReplyNotificationsResolverByReplyPostId;
  replyNotificationsResolverByOriginalPostId: ReplyNotificationsResolverByOriginalPostId;
  repostDeletedStore: RepostDeletedStore;
  repostsResolverByPostId: RepostsResolverByPostId;
  likeDeletedStore: LikeDeletedStore;
  likesResolverByPostId: LikesResolverByPostId;
  emojiReactDeletedStore: EmojiReactDeletedStore;
  emojiReactsResolverByPostId: EmojiReactsResolverByPostId;
  articleResolverByRootPostId: ArticleResolverByRootPostId;
  articleDeletedStore: ArticleDeletedStore;
}>;

const create = ({
  sessionResolver,
  postDeletedStore,
  userResolver,
  actorResolverByUserId,
  postResolver,
  timelineItemDeletedStore,
  timelineItemResolverByPostId,
  likeNotificationDeletedStore,
  likeNotificationsResolverByPostId,
  emojiReactNotificationDeletedStore,
  emojiReactNotificationsResolverByPostId,
  replyNotificationDeletedStore,
  replyNotificationsResolverByReplyPostId,
  replyNotificationsResolverByOriginalPostId,
  repostDeletedStore,
  repostsResolverByPostId,
  likeDeletedStore,
  likesResolverByPostId,
  emojiReactDeletedStore,
  emojiReactsResolverByPostId,
  articleResolverByRootPostId,
  articleDeletedStore,
}: Deps): DeletePostUseCase => {
  const now = Instant.now();
  const resolveSession = resolveSessionWith(sessionResolver, now);
  const resolveUser = resolveUserWith(userResolver);
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('session', ({ sessionId }) => resolveSession(sessionId)),
      RA.andBind('user', ({ session }) => resolveUser(session.userId)),
      RA.andBind('actor', ({ user }) => resolveLocalActor(user.id)),
      RA.andBind('post', async ({ postId }) => {
        const post = await postResolver.resolve(postId);
        if (!post.ok) {
          return post;
        }
        if (post.val === undefined) {
          return RA.err(PostNotFoundError.create(postId));
        }
        return RA.ok(post.val);
      }),
      RA.andThen(async ({ post, user, ctx, postId }) => {
        // Check if the user owns this post
        if (post.type !== 'local' || post.userId !== user.id) {
          return RA.err(UnauthorizedError.create());
        }

        // Resolve all related entities in parallel
        const [
          timelineItemResult,
          likeNotificationsResult,
          emojiReactNotificationsResult,
          replyNotificationsByReplyPostResult,
          replyNotificationsByOriginalPostResult,
          repostsResult,
          likesResult,
          emojiReactsResult,
          articleResult,
        ] = await Promise.all([
          timelineItemResolverByPostId.resolve({ postId }),
          likeNotificationsResolverByPostId.resolve({ postId }),
          emojiReactNotificationsResolverByPostId.resolve({ postId }),
          replyNotificationsResolverByReplyPostId.resolve({ replyPostId: postId }),
          replyNotificationsResolverByOriginalPostId.resolve({ originalPostId: postId }),
          repostsResolverByPostId.resolve({ postId }),
          likesResolverByPostId.resolve({ postId }),
          emojiReactsResolverByPostId.resolve({ postId }),
          articleResolverByRootPostId.resolve({ rootPostId: postId }),
        ]);

        // Generate all delete events
        const timelineItemEvents = timelineItemResult.ok && timelineItemResult.val
          ? [TimelineItem.deleteTimelineItem(timelineItemResult.val.timelineItemId, now)]
          : [];

        const likeNotificationEvents = likeNotificationsResult.ok
          ? likeNotificationsResult.val.map((n) => Notification.deleteLikeNotification(n, now))
          : [];

        const emojiReactNotificationEvents = emojiReactNotificationsResult.ok
          ? emojiReactNotificationsResult.val.map((n) => Notification.deleteEmojiReactNotification(n, now))
          : [];

        const replyNotificationEvents = [
          ...(replyNotificationsByReplyPostResult.ok
            ? replyNotificationsByReplyPostResult.val.map((n) => Notification.deleteReplyNotification(n, now))
            : []),
          ...(replyNotificationsByOriginalPostResult.ok
            ? replyNotificationsByOriginalPostResult.val.map((n) => Notification.deleteReplyNotification(n, now))
            : []),
        ];

        const repostEvents = repostsResult.ok
          ? repostsResult.val.map((r) => Repost.deleteRepost(r, now))
          : [];

        const likeEvents = likesResult.ok
          ? likesResult.val.map((l) => Like.deleteLike(l, now))
          : [];

        const emojiReactEvents = emojiReactsResult.ok
          ? emojiReactsResult.val.map((e) => EmojiReact.deleteEmojiReact(e, now))
          : [];

        const articleToDelete = articleResult.ok ? articleResult.val : undefined;
        const articleDeleteEvent = articleToDelete
          ? Article.deleteArticle(now)(articleToDelete.articleId)
          : undefined;

        // Store all events in batch (each store handles its own transaction)
        // Only call store if there are events to process
        await Promise.all([
          timelineItemEvents.length > 0 ? timelineItemDeletedStore.store(...timelineItemEvents) : Promise.resolve(),
          likeNotificationEvents.length > 0
            ? likeNotificationDeletedStore.store(...likeNotificationEvents)
            : Promise.resolve(),
          emojiReactNotificationEvents.length > 0
            ? emojiReactNotificationDeletedStore.store(...emojiReactNotificationEvents)
            : Promise.resolve(),
          replyNotificationEvents.length > 0
            ? replyNotificationDeletedStore.store(...replyNotificationEvents)
            : Promise.resolve(),
          repostEvents.length > 0 ? repostDeletedStore.store(...repostEvents) : Promise.resolve(),
          likeEvents.length > 0 ? likeDeletedStore.store(...likeEvents) : Promise.resolve(),
          emojiReactEvents.length > 0 ? emojiReactDeletedStore.store(...emojiReactEvents) : Promise.resolve(),
          articleDeleteEvent ? articleDeletedStore.store(articleDeleteEvent) : Promise.resolve(),
        ]);

        // Delete the post via event store
        const deleteEvent = Post.deletePost(now)(postId);
        await postDeletedStore.store(deleteEvent);

        // Build Note URI for the Delete activity using Fedify context
        const noteUri = ctx.getObjectUri(Note, { identifier: user.username, id: postId });

        // Send Delete activity to followers
        await ctx.sendActivity(
          { identifier: user.username },
          'followers',
          new Delete({
            id: new URL(`#delete-${postId}`, noteUri),
            actor: ctx.getActorUri(user.username),
            object: new Tombstone({
              id: noteUri,
            }),
          }),
        );

        // If there was a published article, send Delete activity for it too
        if (articleToDelete && articleToDelete.status === 'published') {
          const articleUri = ctx.getObjectUri(FedifyArticle, {
            identifier: user.username,
            id: articleToDelete.articleId,
          });
          await ctx.sendActivity(
            { identifier: user.username },
            'followers',
            new Delete({
              id: new URL(`#delete-${articleToDelete.articleId}`, articleUri),
              actor: ctx.getActorUri(user.username),
              object: new Tombstone({
                id: articleUri,
              }),
            }),
          );
        }

        return RA.ok({ success: true });
      }),
    );

  return { run };
};

export const DeletePostUseCase = {
  create,
} as const;
