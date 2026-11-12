import { type RequestContext } from '@fedify/fedify';
import { Create, isActor, Note, type Recipient } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { Temporal } from '@js-temporal/polyfill';

import type { PushPayload, WebPushSender } from '../adaptor/webPush/webPush.ts';
import type { Actor, ActorResolverByUserId } from '../domain/actor/actor.ts';
import type { ActorId } from '../domain/actor/actorId.ts';
import type { Agg } from '../domain/aggregate/index.ts';
import type { PostImageCreatedStore } from '../domain/image/image.ts';
import { Instant } from '../domain/instant/instant.ts';
import {
  Notification,
  type ReplyNotification,
  type ReplyNotificationCreatedStore,
} from '../domain/notification/notification.ts';
import { NotificationId } from '../domain/notification/notificationId.ts';
import type { MentionRecipient } from '../domain/post/mention.ts';
import type { LocalPostResolverByUri } from '../domain/post/post.ts';
import {
  type LocalPost,
  Post,
  type PostCreatedStore,
  type PostNotFoundError,
  type PostQuotesResolverByPostIds,
  type PostResolver,
  type RemotePost,
} from '../domain/post/post.ts';
import type { PostId } from '../domain/post/postId.ts';
import { appendQuoteInline } from '../domain/post/quoteInline.ts';
import { sanitizePostContent } from '../domain/post/sanitizePostContent.ts';
import type { Visibility } from '../domain/post/visibility.ts';
import type { PushSubscriptionsResolverByUserId } from '../domain/pushSubscription/pushSubscription.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import { TimelineItem, type TimelineItemCreatedStore } from '../domain/timeline/timelineItem.ts';
import { TimelineItemId } from '../domain/timeline/timelineItemId.ts';
import type { User, UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import { type MentionedActor, toMentionNoteFields } from './helper/mentionNote.ts';
import { toPostAddressing } from './helper/postAddressing.ts';
import { toImageDocument } from './helper/postImageDocument.ts';
import { type PostImagesInput, toPostImages } from './helper/postImages.ts';
import { resolveQuoteNoteFields } from './helper/quoteNote.ts';
import { isRemotePostObject } from './helper/remotePostObject.ts';
import { type Requester, resolveLocalActorWith, resolveRequesterUserWith } from './helper/resolve.ts';
import { sendToMentions } from './helper/sendToMentions.ts';
import type { ScheduleBlueskyCrosspostUseCase } from './scheduleBlueskyCrosspost.ts';
import type { UseCase } from './useCase.ts';

type Input =
  & Requester
  & PostImagesInput
  & Readonly<{
    postId: PostId;
    content: string;
    sourceText?: string;
    summary?: string | null;
    sensitive?: boolean;
    visibility?: Visibility;
    crosspostToBluesky?: boolean;
    mentions?: ReadonlyArray<MentionRecipient>;
    quoteUri?: string;
    request: Request;
    ctx: RequestContext<unknown>;
  }>;

type Ok = Readonly<{ post: Post; user: User }>;

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
  actorResolverById?: Agg.Resolver<ActorId, Actor | undefined>;
  postQuotesResolver?: PostQuotesResolverByPostIds;
  scheduleBlueskyCrosspost?: ScheduleBlueskyCrosspostUseCase;
  origin: string;
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
  actorResolverById,
  postQuotesResolver,
  scheduleBlueskyCrosspost,
  origin,
}: Deps): SendReplyUseCase => {
  const now = Instant.now();
  const resolveRequesterUser = resolveRequesterUserWith(sessionResolver, userResolver, now);
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

  type RemoteAuthor = Readonly<{ mention: MentionedActor; recipient: Recipient }>;

  const resolveStoredAuthor = async (parentPost: RemotePost): Promise<RemoteAuthor | undefined> => {
    const stored = await actorResolverById?.resolve(parentPost.actorId);
    const author = stored?.ok ? stored.val : undefined;
    if (author?.type !== 'remote' || !URL.canParse(author.uri) || !URL.canParse(author.inboxUrl)) {
      return undefined;
    }
    const id = new URL(author.uri);
    return {
      mention: { id, ...(author.username === undefined ? {} : { name: `@${author.username}@${id.host}` }) },
      recipient: { id, inboxId: new URL(author.inboxUrl), endpoints: null },
    };
  };

  const lookupAuthor = async (
    objectUri: string,
    ctx: RequestContext<unknown>,
    username: string,
  ): RA<RemoteAuthor, RemoteNoteLookupError> => {
    const documentLoader = await ctx.getDocumentLoader({ identifier: username });
    const result = await ctx.lookupObject(objectUri.trim(), { documentLoader });

    if (!isRemotePostObject(result)) {
      return RA.err(RemoteNoteLookupError.create(objectUri, 'Not a valid Note object'));
    }
    if (!result.id) {
      return RA.err(RemoteNoteLookupError.create(objectUri, 'Could not resolve Note ID'));
    }
    const author = await result.getAttribution();
    if (!author || !isActor(author)) {
      return RA.err(RemoteNoteLookupError.create(objectUri, 'Could not resolve Note author'));
    }
    if (!author.id || !author.inboxId) {
      return RA.err(RemoteNoteLookupError.create(objectUri, 'Note author has no inbox'));
    }
    const authorUsername = author.preferredUsername?.toString();
    return RA.ok({
      mention: {
        id: author.id,
        ...(authorUsername === undefined ? {} : { name: `@${authorUsername}@${author.id.host}` }),
      },
      recipient: author,
    });
  };

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('user', (requester) => resolveRequesterUser(requester)),
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
      RA.andBind(
        'remoteAuthor',
        async ({ parentPost, ctx, user }): RA<RemoteAuthor | undefined, RemoteNoteLookupError> => {
          if (parentPost.type === 'local') {
            return RA.ok(undefined);
          }
          const stored = await resolveStoredAuthor(parentPost);
          return stored === undefined ? lookupAuthor(parentPost.uri, ctx, user.username) : RA.ok(stored);
        },
      ),
      // Create the reply post
      RA.andBind('participantActorUris', async ({ user, ctx, parentPost, content, visibility }) => {
        if (visibility !== 'direct') {
          return RA.ok([]);
        }
        const parentAuthor = parentPost.type === 'remote'
          ? await actorResolverById?.resolve(parentPost.actorId)
          : undefined;
        const parentAuthorUri = parentAuthor?.ok ? parentAuthor.val?.uri : undefined;
        return RA.ok([
          ctx.getActorUri(user.username).href,
          ...(parentAuthorUri === undefined ? [] : [parentAuthorUri]),
          ...toMentionNoteFields(sanitizePostContent(content)).ccs.map((uri) => uri.href),
        ]);
      }),
      RA.andBind(
        'postEvent',
        (
          { actor, content, sourceText, inReplyToUri, summary, sensitive, visibility, quoteUri, participantActorUris },
        ) => {
          const postEvent = Post.createPost(now)({
            actorId: actor.id,
            content: quoteUri === undefined ? content : appendQuoteInline(content, quoteUri),
            userId: actor.userId,
            inReplyToUri,
            summary,
            sensitive,
            visibility,
            quoteUri,
            sourceText,
            participantActorUris,
          });
          return RA.ok(postEvent);
        },
      ),
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
      RA.andBind('images', async (input) => {
        const images = toPostImages(input.replyPost.postId, input, now);
        if (images.length > 0) {
          await postImageCreatedStore.store(images);
        }
        return RA.ok(images);
      }),
      // Send ActivityPub Create activity (only for remote parent posts)
      RA.andThrough(
        async ({ user, parentPost, replyPost, images, ctx, inReplyToUri, mentions, quoteUri, remoteAuthor }) => {
          const quote = await resolveQuoteNoteFields(
            postQuotesResolver,
            replyPost.postId,
            quoteUri,
            replyPost.visibility,
          );
          // For local parent posts, no ActivityPub delivery to remote author needed
          if (parentPost.type === 'local') {
            // Still send to followers
            const mentionFields = toMentionNoteFields(replyPost.content, quote.actors);
            const replyNote = new Note({
              id: ctx.getObjectUri(Note, { identifier: user.username, id: replyPost.postId }),
              attribution: ctx.getActorUri(user.username),
              ...toPostAddressing({
                visibility: replyPost.visibility,
                followersUri: ctx.getFollowersUri(user.username),
                mentionUris: mentionFields.ccs,
              }),
              tags: mentionFields.tags,
              content: replyPost.content,
              mediaType: 'text/html',
              published: Temporal.Instant.fromEpochMilliseconds(replyPost.createdAt),
              url: ctx.getObjectUri(Note, { identifier: user.username, id: replyPost.postId }),
              summary: replyPost.summary,
              sensitive: replyPost.sensitive,
              replyTarget: new URL(inReplyToUri),
              quoteUrl: quote.quoteUrl,
              attachments: images.map((image) => toImageDocument(image, origin)),
            });

            const createActivity = new Create({
              id: new URL('#activity', replyNote.id ?? undefined),
              object: replyNote,
              actors: replyNote.attributionIds,
              tos: replyNote.toIds,
              ccs: replyNote.ccIds,
            });
            if (replyPost.visibility !== 'direct') {
              await ctx.sendActivity({ identifier: user.username }, 'followers', createActivity);
            }
            await sendToMentions({
              ctx,
              identifier: user.username,
              activity: createActivity,
              mentions: [...(mentions ?? []), ...quote.recipients],
              visibility: replyPost.visibility,
            });

            return RA.ok(undefined);
          }

          // For remote parent posts, send to the author
          if (remoteAuthor === undefined) {
            return RA.ok(undefined);
          }
          const objectUri = parentPost.uri;
          const mentionFields = toMentionNoteFields(replyPost.content, [remoteAuthor.mention, ...quote.actors]);
          const replyNote = new Note({
            id: ctx.getObjectUri(Note, { identifier: user.username, id: replyPost.postId }),
            attribution: ctx.getActorUri(user.username),
            ...toPostAddressing({
              visibility: replyPost.visibility,
              followersUri: ctx.getFollowersUri(user.username),
              mentionUris: mentionFields.ccs,
            }),
            tags: mentionFields.tags,
            content: replyPost.content,
            mediaType: 'text/html',
            published: Temporal.Instant.fromEpochMilliseconds(replyPost.createdAt),
            url: ctx.getObjectUri(Note, { identifier: user.username, id: replyPost.postId }),
            summary: replyPost.summary,
            sensitive: replyPost.sensitive,
            replyTarget: new URL(objectUri),
            quoteUrl: quote.quoteUrl,
            attachments: images.map((image) => toImageDocument(image, origin)),
          });

          // Send to the note's author
          await ctx.sendActivity(
            { username: user.username },
            remoteAuthor.recipient,
            new Create({
              id: new URL('#activity', replyNote.id ?? undefined),
              object: replyNote,
              actors: replyNote.attributionIds,
              tos: replyNote.toIds,
              ccs: replyNote.ccIds,
            }),
          );

          // Also send to followers
          const followersActivity = new Create({
            id: new URL('#activity', replyNote.id ?? undefined),
            object: replyNote,
            actors: replyNote.attributionIds,
            tos: replyNote.toIds,
            ccs: replyNote.ccIds,
          });
          if (replyPost.visibility !== 'direct') {
            await ctx.sendActivity({ identifier: user.username }, 'followers', followersActivity);
          }
          await sendToMentions({
            ctx,
            identifier: user.username,
            activity: followersActivity,
            mentions: [...(mentions ?? []), ...quote.recipients],
            excludedActorIds: [remoteAuthor.mention.id.href],
            visibility: replyPost.visibility,
          });

          return RA.ok(undefined);
        },
      ),
      RA.andThrough(async ({ replyPost, crosspostToBluesky }) => {
        if (crosspostToBluesky !== false) {
          await scheduleBlueskyCrosspost?.run({ postId: replyPost.postId });
        }
        return RA.ok(undefined);
      }),
      // Create reply notification if replying to a local post (and not self-reply)
      RA.andThrough(async ({ actor, replyPost, parentPost, inReplyToUri }) => {
        if (replyPost.visibility === 'direct') {
          return RA.ok(undefined);
        }
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
      RA.andThrough(async ({ actor, user, replyPost, parentPost, inReplyToUri }) => {
        if (replyPost.visibility === 'direct') {
          return RA.ok(undefined);
        }
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
      RA.map(({ replyPost, user }) => ({ post: replyPost, user })),
    );

  return { run };
};

export const SendReplyUseCase = {
  create,
} as const;
