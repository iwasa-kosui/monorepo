import { Create, Document, isActor, Note, PUBLIC_COLLECTION, type RequestContext } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { Temporal } from '@js-temporal/polyfill';

import type { LocalPostResolverByUri } from '../adaptor/pg/post/localPostResolverByUri.ts';
import type { PushPayload, WebPushSender } from '../adaptor/webPush/webPushSender.ts';
import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import type { PostImage, PostImageCreatedStore } from '../domain/image/image.ts';
import { ImageId } from '../domain/image/imageId.ts';
import { getMimeTypeFromUrl } from '../domain/image/mimeType.ts';
import { Instant } from '../domain/instant/instant.ts';
import {
  Notification,
  type ReplyNotification,
  type ReplyNotificationCreatedStore,
} from '../domain/notification/notification.ts';
import { NotificationId } from '../domain/notification/notificationId.ts';
import {
  type LocalPost,
  Post,
  type PostCreatedStore,
  type PostNotFoundError,
  type PostResolver,
  type RemotePost,
} from '../domain/post/post.ts';
import type { PostId } from '../domain/post/postId.ts';
import type { PushSubscriptionsResolverByUserId } from '../domain/pushSubscription/pushSubscription.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import type { SessionId } from '../domain/session/sessionId.ts';
import { TimelineItem, type TimelineItemCreatedStore } from '../domain/timeline/timelineItem.ts';
import { TimelineItemId } from '../domain/timeline/timelineItemId.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import { Env } from '../env.ts';
import { resolveLocalActorWith, resolveSessionWith, resolveUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  sessionId: SessionId;
  postId: PostId;
  content: string;
  imageUrls: string[];
  request: Request;
  ctx: RequestContext<unknown>;
}>;

type Ok = void;

export type RemoteNoteLookupError = Readonly<{
  type: 'RemoteNoteLookupError';
  message: string;
  detail: {
    objectUri: string;
    reason: string;
  };
}>;

export const RemoteNoteLookupError = {
  create: (objectUri: string, reason: string): RemoteNoteLookupError => ({
    type: 'RemoteNoteLookupError',
    message: `Failed to lookup remote note "${objectUri}": ${reason}`,
    detail: { objectUri, reason },
  }),
} as const;

type Err =
  | SessionExpiredError
  | UserNotFoundError
  | PostNotFoundError
  | RemoteNoteLookupError;

export type SendReplyUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  postCreatedStore: PostCreatedStore;
  postImageCreatedStore: PostImageCreatedStore;
  timelineItemCreatedStore: TimelineItemCreatedStore;
  localPostResolverByUri: LocalPostResolverByUri;
  replyNotificationCreatedStore: ReplyNotificationCreatedStore;
  pushSubscriptionsResolver: PushSubscriptionsResolverByUserId;
  webPushSender: WebPushSender;
  postResolver: PostResolver;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  postCreatedStore,
  postImageCreatedStore,
  timelineItemCreatedStore,
  localPostResolverByUri,
  replyNotificationCreatedStore,
  pushSubscriptionsResolver,
  webPushSender,
  postResolver,
}: Deps): SendReplyUseCase => {
  const now = Instant.now();
  const resolveSession = resolveSessionWith(sessionResolver, now);
  const resolveUser = resolveUserWith(userResolver);
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  type ResolvedPost = LocalPost | RemotePost;

  const resolvePostOrErr = (postId: PostId): RA<ResolvedPost, PostNotFoundError> =>
    RA.flow(
      postResolver.resolve(postId),
      RA.andThen((post) =>
        post === undefined
          ? RA.err(
            {
              type: 'PostNotFoundError',
              message: `Post not found: ${postId}`,
              detail: { postId },
            } as PostNotFoundError,
          )
          : RA.ok(post)
      ),
    );

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('session', ({ sessionId }) => resolveSession(sessionId)),
      RA.andBind('user', ({ session }) => resolveUser(session.userId)),
      RA.andBind('actor', ({ user }) => resolveLocalActor(user.id)),
      // Resolve the parent post
      RA.andBind('parentPost', ({ postId }) => resolvePostOrErr(postId)),
      // Get the inReplyToUri for the new post
      RA.andBind('inReplyToUri', async ({ parentPost, ctx, user }) => {
        if (parentPost.type === 'local') {
          // For local posts, generate a URI
          const noteUri = ctx.getObjectUri(Note, { identifier: user.username, id: parentPost.postId });
          return RA.ok(noteUri.href);
        }
        // For remote posts, use the existing URI
        return RA.ok(parentPost.uri);
      }),
      // Create the reply post
      RA.andBind('postEvent', ({ actor, content, inReplyToUri }) => {
        const postEvent = Post.createPost(now)({
          actorId: actor.id,
          content,
          userId: actor.userId,
          inReplyToUri,
        });
        return RA.ok(postEvent);
      }),
      RA.andThrough(({ postEvent }) => postCreatedStore.store(postEvent)),
      RA.bind('replyPost', ({ postEvent }) => postEvent.aggregateState),
      // Create timeline item
      RA.andThrough(({ replyPost, actor }) => {
        const timelineItemEvent = TimelineItem.createTimelineItem({
          timelineItemId: TimelineItemId.generate(),
          type: 'post',
          actorId: actor.id,
          postId: replyPost.postId,
          repostId: null,
          createdAt: now,
        }, now);
        return timelineItemCreatedStore.store(timelineItemEvent);
      }),
      // Store images
      RA.andBind('images', async ({ replyPost, imageUrls }) => {
        if (imageUrls.length > 0) {
          const images: PostImage[] = imageUrls.map((url) => ({
            imageId: ImageId.generate(),
            postId: replyPost.postId,
            url,
            altText: null,
            createdAt: now,
          }));
          await postImageCreatedStore.store(images);
          return RA.ok(images);
        }
        return RA.ok([]);
      }),
      // Send ActivityPub Create activity (only for remote parent posts)
      RA.andThrough(async ({ user, parentPost, replyPost, images, ctx, inReplyToUri }) => {
        // For local parent posts, no ActivityPub delivery to remote author needed
        if (parentPost.type === 'local') {
          // Still send to followers
          const replyNote = new Note({
            id: ctx.getObjectUri(Note, { identifier: user.username, id: replyPost.postId }),
            attribution: ctx.getActorUri(user.username),
            to: PUBLIC_COLLECTION,
            cc: ctx.getFollowersUri(user.username),
            content: replyPost.content,
            mediaType: 'text/html',
            published: Temporal.Instant.fromEpochMilliseconds(replyPost.createdAt),
            url: ctx.getObjectUri(Note, { identifier: user.username, id: replyPost.postId }),
            replyTarget: new URL(inReplyToUri),
            attachments: images.map(
              (image) =>
                new Document({
                  url: new URL(`${Env.getInstance().ORIGIN}${image.url}`),
                  mediaType: getMimeTypeFromUrl(image.url),
                }),
            ),
          });

          await ctx.sendActivity(
            { identifier: user.username },
            'followers',
            new Create({
              id: new URL('#activity', replyNote.id ?? undefined),
              object: replyNote,
              actors: replyNote.attributionIds,
              tos: replyNote.toIds,
              ccs: replyNote.ccIds,
            }),
          );

          return RA.ok(undefined);
        }

        // For remote parent posts, lookup and send to the author
        const objectUri = parentPost.uri;
        const documentLoader = await ctx.getDocumentLoader({
          identifier: user.username,
        });
        const result = await ctx.lookupObject(objectUri.trim(), {
          documentLoader,
        });

        if (!(result instanceof Note)) {
          return RA.err(
            RemoteNoteLookupError.create(objectUri, 'Not a valid Note object'),
          );
        }

        if (!result.id) {
          return RA.err(
            RemoteNoteLookupError.create(objectUri, 'Could not resolve Note ID'),
          );
        }

        const author = await result.getAttribution();
        if (!author || !isActor(author)) {
          return RA.err(
            RemoteNoteLookupError.create(objectUri, 'Could not resolve Note author'),
          );
        }
        if (!author.id || !author.inboxId) {
          return RA.err(
            RemoteNoteLookupError.create(objectUri, 'Note author has no inbox'),
          );
        }

        const replyNote = new Note({
          id: ctx.getObjectUri(Note, { identifier: user.username, id: replyPost.postId }),
          attribution: ctx.getActorUri(user.username),
          to: PUBLIC_COLLECTION,
          cc: ctx.getFollowersUri(user.username),
          content: replyPost.content,
          mediaType: 'text/html',
          published: Temporal.Instant.fromEpochMilliseconds(replyPost.createdAt),
          url: ctx.getObjectUri(Note, { identifier: user.username, id: replyPost.postId }),
          replyTarget: new URL(objectUri),
          attachments: images.map(
            (image) =>
              new Document({
                url: new URL(`${Env.getInstance().ORIGIN}${image.url}`),
                mediaType: getMimeTypeFromUrl(image.url),
              }),
          ),
        });

        // Send to the note's author
        await ctx.sendActivity(
          { username: user.username },
          author,
          new Create({
            id: new URL('#activity', replyNote.id ?? undefined),
            object: replyNote,
            actors: replyNote.attributionIds,
            tos: replyNote.toIds,
            ccs: replyNote.ccIds,
          }),
        );

        // Also send to followers
        await ctx.sendActivity(
          { identifier: user.username },
          'followers',
          new Create({
            id: new URL('#activity', replyNote.id ?? undefined),
            object: replyNote,
            actors: replyNote.attributionIds,
            tos: replyNote.toIds,
            ccs: replyNote.ccIds,
          }),
        );

        return RA.ok(undefined);
      }),
      // Create reply notification if replying to a local post (and not self-reply)
      RA.andThrough(async ({ actor, replyPost, parentPost, inReplyToUri }) => {
        // Check if parent is a local post
        if (parentPost.type !== 'local') {
          // Also check via URI resolver for backwards compatibility
          const originalPostResult = await localPostResolverByUri.resolve({ uri: inReplyToUri });
          if (!originalPostResult.ok || !originalPostResult.val) {
            return RA.ok(undefined);
          }
          const originalPost: LocalPost = originalPostResult.val;
          if (originalPost.userId === actor.userId) {
            return RA.ok(undefined);
          }
          const notificationId = NotificationId.generate();
          const notification: ReplyNotification = {
            type: 'reply',
            notificationId,
            recipientUserId: originalPost.userId,
            isRead: false,
            replierActorId: actor.id,
            replyPostId: replyPost.postId,
            originalPostId: originalPost.postId,
          };
          const event = Notification.createReplyNotification(notification, now);
          await replyNotificationCreatedStore.store(event);
          return RA.ok(undefined);
        }

        // Parent is local post
        if (parentPost.userId === actor.userId) {
          return RA.ok(undefined);
        }
        const notificationId = NotificationId.generate();
        const notification: ReplyNotification = {
          type: 'reply',
          notificationId,
          recipientUserId: parentPost.userId,
          isRead: false,
          replierActorId: actor.id,
          replyPostId: replyPost.postId,
          originalPostId: parentPost.postId,
        };
        const event = Notification.createReplyNotification(notification, now);
        await replyNotificationCreatedStore.store(event);
        return RA.ok(undefined);
      }),
      // Send web push notification for reply
      RA.andThrough(async ({ actor, user, parentPost, inReplyToUri }) => {
        // Check if parent is local
        if (parentPost.type !== 'local') {
          const originalPostResult = await localPostResolverByUri.resolve({ uri: inReplyToUri });
          if (!originalPostResult.ok || !originalPostResult.val) {
            return RA.ok(undefined);
          }
          const originalPost: LocalPost = originalPostResult.val;
          if (originalPost.userId === actor.userId) {
            return RA.ok(undefined);
          }
          const payload: PushPayload = {
            title: 'New Reply',
            body: `${user.username} replied to your post`,
            url: '/notifications',
          };
          const subscriptionsResult = await pushSubscriptionsResolver.resolve(originalPost.userId);
          if (!subscriptionsResult.ok) {
            return RA.ok(undefined);
          }
          for (const subscription of subscriptionsResult.val) {
            await webPushSender.send(subscription, payload);
          }
          return RA.ok(undefined);
        }

        // Parent is local
        if (parentPost.userId === actor.userId) {
          return RA.ok(undefined);
        }
        const payload: PushPayload = {
          title: 'New Reply',
          body: `${user.username} replied to your post`,
          url: '/notifications',
        };
        const subscriptionsResult = await pushSubscriptionsResolver.resolve(parentPost.userId);
        if (!subscriptionsResult.ok) {
          return RA.ok(undefined);
        }
        for (const subscription of subscriptionsResult.val) {
          await webPushSender.send(subscription, payload);
        }
        return RA.ok(undefined);
      }),
      RA.map(() => undefined),
    );

  return { run };
};

export const SendReplyUseCase = {
  create,
} as const;
