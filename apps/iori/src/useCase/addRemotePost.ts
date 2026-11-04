import { RA } from '@iwasa-kosui/result';

import type { OgpFetcher } from '../adaptor/ogp/ogpFetcher.ts';
import { extractUrlsFromHtml } from '../adaptor/ogp/urlExtractor.ts';
import type { PushPayload, WebPushSender } from '../adaptor/webPush/webPush.ts';
import type { Actor, ActorResolverByUri } from '../domain/actor/actor.ts';
import type { ActorId } from '../domain/actor/actorId.ts';
import type { RemoteActorCreatedStore, RemoteActorProfile } from '../domain/actor/remoteActor.ts';
import type { LogoUriUpdatedStore } from '../domain/actor/updateLogoUri.ts';
import type { RemoteActorProfileUpdatedStore } from '../domain/actor/updateProfile.ts';
import type { PostImage, PostImageCreatedStore, PostImagesResolverByPostId } from '../domain/image/image.ts';
import { ImageId } from '../domain/image/imageId.ts';
import { Instant } from '../domain/instant/instant.ts';
import type {
  LinkPreview,
  LinkPreviewCreatedStore,
  LinkPreviewsResolverByPostId,
} from '../domain/linkPreview/linkPreview.ts';
import { LinkPreviewId } from '../domain/linkPreview/linkPreviewId.ts';
import {
  Notification,
  type ReplyNotification,
  type ReplyNotificationCreatedStore,
  type ReplyNotificationsResolverByReplyPostId,
} from '../domain/notification/notification.ts';
import { NotificationId } from '../domain/notification/notificationId.ts';
import {
  type LocalPost,
  type LocalPostResolverByUri,
  Post,
  type PostCreatedStore,
  type PostResolverByUri,
  type RemotePost,
  type RemotePostAttachment,
} from '../domain/post/post.ts';
import type { Visibility } from '../domain/post/visibility.ts';
import type { PushSubscriptionsResolverByUserId } from '../domain/pushSubscription/pushSubscription.ts';
import {
  TimelineItem,
  type TimelineItemCreatedStore,
  type TimelineItemsResolverByPostId,
} from '../domain/timeline/timelineItem.ts';
import { TimelineItemId } from '../domain/timeline/timelineItemId.ts';
import { upsertRemoteActor } from './helper/upsertRemoteActor.ts';
import type { UseCase } from './useCase.ts';

type ActorIdentity = Readonly<{
  uri: string;
  inboxUrl: string;
  url?: string;
  username?: string;
  logoUri?: string;
  profile?: RemoteActorProfile;
}>;

type Input = Readonly<{
  content: string;
  uri: string;
  actorIdentity: ActorIdentity;
  attachments: RemotePostAttachment[];
  inReplyToUri?: string | null;
  visibility: Visibility | null;
  recipientActorUris?: ReadonlyArray<string>;
}>;

type Ok = Readonly<{
  post: RemotePost;
  actor: Actor;
}>;

export type RemotePostAuthorMismatchError = Readonly<{
  type: 'RemotePostAuthorMismatchError';
  message: string;
  detail: {
    uri: string;
    existingActorId: ActorId;
    actorId: ActorId;
  };
}>;

export const RemotePostAuthorMismatchError = {
  create: (detail: { uri: string; existingActorId: ActorId; actorId: ActorId }): RemotePostAuthorMismatchError => ({
    type: 'RemotePostAuthorMismatchError',
    message:
      `The post with URI "${detail.uri}" belongs to actor "${detail.existingActorId}", not to actor "${detail.actorId}".`,
    detail,
  }),
} as const;

type Err = RemotePostAuthorMismatchError;

export type AddRemotePostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  origin: string;
  postCreatedStore: PostCreatedStore;
  postResolverByUri: PostResolverByUri;
  postImageCreatedStore: PostImageCreatedStore;
  postImagesResolver: PostImagesResolverByPostId;
  remoteActorCreatedStore: RemoteActorCreatedStore;
  logoUriUpdatedStore: LogoUriUpdatedStore;
  remoteActorProfileUpdatedStore?: RemoteActorProfileUpdatedStore;
  actorResolverByUri: ActorResolverByUri;
  timelineItemCreatedStore: TimelineItemCreatedStore;
  timelineItemsResolverByPostId: TimelineItemsResolverByPostId;
  localPostResolverByUri: LocalPostResolverByUri;
  replyNotificationCreatedStore: ReplyNotificationCreatedStore;
  replyNotificationsResolverByReplyPostId: ReplyNotificationsResolverByReplyPostId;
  pushSubscriptionsResolver: PushSubscriptionsResolverByUserId;
  webPushSender: WebPushSender;
  linkPreviewCreatedStore: LinkPreviewCreatedStore;
  linkPreviewsResolver: LinkPreviewsResolverByPostId;
  ogpFetcher: OgpFetcher;
}>;

const create = ({
  origin,
  postCreatedStore,
  postResolverByUri,
  postImageCreatedStore,
  postImagesResolver,
  remoteActorCreatedStore,
  logoUriUpdatedStore,
  remoteActorProfileUpdatedStore,
  actorResolverByUri,
  timelineItemCreatedStore,
  timelineItemsResolverByPostId,
  localPostResolverByUri,
  replyNotificationCreatedStore,
  replyNotificationsResolverByReplyPostId,
  pushSubscriptionsResolver,
  webPushSender,
  linkPreviewCreatedStore,
  linkPreviewsResolver,
  ogpFetcher,
}: Deps): AddRemotePostUseCase => {
  const run = async (input: Input) => {
    const now = Instant.now();

    return RA.flow(
      RA.ok(input),
      RA.andBind('actor', ({ actorIdentity }) =>
        upsertRemoteActor({
          now,
          remoteActorCreatedStore,
          logoUriUpdatedStore,
          remoteActorProfileUpdatedStore,
          actorResolverByUri,
        })(actorIdentity)),
      RA.andBind('saved', async ({ actor, content, uri, inReplyToUri, visibility, recipientActorUris }) => {
        const existing = await postResolverByUri.resolve({ uri });
        if (existing.ok && existing.val) {
          if (existing.val.actorId !== actor.id) {
            return RA.err(
              RemotePostAuthorMismatchError.create({ uri, existingActorId: existing.val.actorId, actorId: actor.id }),
            );
          }
          return RA.ok({ post: existing.val });
        }
        const createPost = Post.createRemotePost(now)({
          content,
          uri,
          actorId: actor.id,
          inReplyToUri,
          visibility,
          recipientActorUris,
        });
        try {
          await postCreatedStore.store(createPost);
        } catch (error) {
          let resolved;
          try {
            resolved = await postResolverByUri.resolve({ uri });
          } catch {
            throw error;
          }
          if (resolved.ok && resolved.val) {
            if (resolved.val.actorId !== actor.id) {
              return RA.err(
                RemotePostAuthorMismatchError.create({ uri, existingActorId: resolved.val.actorId, actorId: actor.id }),
              );
            }
            return RA.ok({ post: resolved.val });
          }
          throw error;
        }
        return RA.ok({ post: createPost.aggregateState });
      }),
      RA.andThrough(async ({ saved: { post }, actor }) => {
        const existingItems = await timelineItemsResolverByPostId.resolve({ postId: post.postId });
        if (existingItems.ok && existingItems.val.some((item) => item.type === 'post' && item.actorId === actor.id)) {
          return RA.ok(undefined);
        }
        const timelineItemEvent = TimelineItem.createTimelineItem({
          timelineItemId: TimelineItemId.generate(),
          type: 'post',
          actorId: actor.id,
          postId: post.postId,
          repostId: null,
          createdAt: now,
        }, now);
        return timelineItemCreatedStore.store(timelineItemEvent);
      }),
      RA.andThrough(async ({ saved: { post }, attachments }) => {
        if (attachments.length === 0) {
          return RA.ok(undefined);
        }
        const existingImages = await postImagesResolver.resolve(post.postId);
        if (existingImages.ok && existingImages.val.length > 0) {
          return RA.ok(undefined);
        }
        const images: PostImage[] = attachments.map((attachment) => ({
          imageId: ImageId.generate(),
          postId: post.postId,
          url: attachment.url,
          altText: attachment.altText,
          createdAt: now,
        }));
        await postImageCreatedStore.store(images);
        return RA.ok(undefined);
      }),
      // Fetch and store link previews
      RA.andThrough(async ({ saved: { post }, content }) => {
        const excludeHost = new URL(origin).host;
        const urls = extractUrlsFromHtml(content, excludeHost);

        if (urls.length === 0) {
          return RA.ok(undefined);
        }

        const existingPreviews = await linkPreviewsResolver.resolve(post.postId);
        if (existingPreviews.ok && existingPreviews.val.length > 0) {
          return RA.ok(undefined);
        }

        const ogpResults = await Promise.allSettled(
          urls.map((url) => ogpFetcher.fetch(url)),
        );

        const linkPreviews: LinkPreview[] = [];
        for (let i = 0; i < ogpResults.length; i++) {
          const result = ogpResults[i];
          if (result.status === 'fulfilled') {
            const ogp = result.value;
            if (ogp.title ?? ogp.description) {
              linkPreviews.push({
                linkPreviewId: LinkPreviewId.generate(),
                postId: post.postId,
                url: urls[i],
                title: ogp.title,
                description: ogp.description,
                imageUrl: ogp.imageUrl,
                faviconUrl: ogp.faviconUrl,
                siteName: ogp.siteName,
                createdAt: now,
              });
            }
          }
        }

        if (linkPreviews.length > 0) {
          await linkPreviewCreatedStore.store(linkPreviews);
        }

        return RA.ok(undefined);
      }),
      // Create reply notification if this is a reply to a local post
      RA.andBind('replyNotificationCreated', async ({ saved: { post }, actor, inReplyToUri }) => {
        if (!inReplyToUri) {
          return RA.ok(false);
        }
        const originalPostResult = await localPostResolverByUri.resolve({ uri: inReplyToUri });
        if (!originalPostResult.ok || !originalPostResult.val) {
          // Not a local post, skip notification
          return RA.ok(false);
        }
        const originalPost: LocalPost = originalPostResult.val;
        const existingNotifications = await replyNotificationsResolverByReplyPostId.resolve({
          replyPostId: post.postId,
        });
        if (
          existingNotifications.ok
          && existingNotifications.val.some((existing) => existing.originalPostId === originalPost.postId)
        ) {
          return RA.ok(false);
        }
        // Create reply notification
        const notificationId = NotificationId.generate();
        const notification: ReplyNotification = {
          type: 'reply',
          notificationId,
          recipientUserId: originalPost.userId,
          isRead: false,
          replierActorId: actor.id,
          replyPostId: post.postId,
          originalPostId: originalPost.postId,
        };
        const event = Notification.createReplyNotification(notification, now);
        await replyNotificationCreatedStore.store(event);
        return RA.ok(true);
      }),
      // Send web push notification for reply
      RA.andThrough(async ({ replyNotificationCreated, actor, inReplyToUri }) => {
        if (!replyNotificationCreated || !inReplyToUri) {
          return RA.ok(undefined);
        }
        const originalPostResult = await localPostResolverByUri.resolve({ uri: inReplyToUri });
        if (!originalPostResult.ok || !originalPostResult.val) {
          return RA.ok(undefined);
        }
        const originalPost: LocalPost = originalPostResult.val;
        const replierName = actor.type === 'remote' && actor.username ? actor.username : 'Someone';
        const payload: PushPayload = {
          title: 'New Reply',
          body: `${replierName} replied to your post`,
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
      }),
      RA.map(({ saved: { post }, actor }) => ({ post, actor })),
    );
  };

  return { run };
};

export const AddRemotePostUseCase = {
  create,
} as const;
