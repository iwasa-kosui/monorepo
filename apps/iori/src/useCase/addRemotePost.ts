import { RA } from '@iwasa-kosui/result';

import type { OgpFetcher } from '../adaptor/ogp/ogpFetcher.ts';
import { extractUrlsFromHtml } from '../adaptor/ogp/urlExtractor.ts';
import type { LocalPostResolverByUri } from '../adaptor/pg/post/localPostResolverByUri.ts';
import type { PushPayload, WebPushSender } from '../adaptor/webPush/webPushSender.ts';
import type { Actor, ActorResolverByUri } from '../domain/actor/actor.ts';
import type { RemoteActorCreatedStore } from '../domain/actor/remoteActor.ts';
import type { LogoUriUpdatedStore } from '../domain/actor/updateLogoUri.ts';
import type { PostImage, PostImageCreatedStore } from '../domain/image/image.ts';
import { ImageId } from '../domain/image/imageId.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { LinkPreview, LinkPreviewCreatedStore } from '../domain/linkPreview/linkPreview.ts';
import { LinkPreviewId } from '../domain/linkPreview/linkPreviewId.ts';
import {
  Notification,
  type ReplyNotification,
  type ReplyNotificationCreatedStore,
} from '../domain/notification/notification.ts';
import { NotificationId } from '../domain/notification/notificationId.ts';
import { type LocalPost, Post, type PostCreatedStore, type RemotePostCreated } from '../domain/post/post.ts';
import type { PushSubscriptionsResolverByUserId } from '../domain/pushSubscription/pushSubscription.ts';
import { TimelineItem, type TimelineItemCreatedStore } from '../domain/timeline/timelineItem.ts';
import { TimelineItemId } from '../domain/timeline/timelineItemId.ts';
import { Env } from '../env.ts';
import { upsertRemoteActor } from './helper/upsertRemoteActor.ts';
import type { UseCase } from './useCase.ts';

type Attachment = Readonly<{
  url: string;
  altText: string | null;
}>;

type ActorIdentity = Readonly<{
  uri: string;
  inboxUrl: string;
  url?: string;
  username?: string;
  logoUri?: string;
}>;

type Input = Readonly<{
  content: string;
  uri: string;
  actorIdentity: ActorIdentity;
  attachments: Attachment[];
  inReplyToUri?: string | null;
}>;

type Ok = Readonly<{
  post: RemotePostCreated;
  actor: Actor;
}>;

type Err = never;

export type AddRemotePostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  postCreatedStore: PostCreatedStore;
  postImageCreatedStore: PostImageCreatedStore;
  remoteActorCreatedStore: RemoteActorCreatedStore;
  logoUriUpdatedStore: LogoUriUpdatedStore;
  actorResolverByUri: ActorResolverByUri;
  timelineItemCreatedStore: TimelineItemCreatedStore;
  localPostResolverByUri: LocalPostResolverByUri;
  replyNotificationCreatedStore: ReplyNotificationCreatedStore;
  pushSubscriptionsResolver: PushSubscriptionsResolverByUserId;
  webPushSender: WebPushSender;
  linkPreviewCreatedStore: LinkPreviewCreatedStore;
  ogpFetcher: OgpFetcher;
}>;

const create = ({
  postCreatedStore,
  postImageCreatedStore,
  remoteActorCreatedStore,
  logoUriUpdatedStore,
  actorResolverByUri,
  timelineItemCreatedStore,
  localPostResolverByUri,
  replyNotificationCreatedStore,
  pushSubscriptionsResolver,
  webPushSender,
  linkPreviewCreatedStore,
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
          actorResolverByUri,
        })(actorIdentity)),
      RA.andBind('post', ({ actor, content, uri, inReplyToUri }) => {
        const createPost = Post.createRemotePost(now)({
          content,
          uri,
          actorId: actor.id,
          inReplyToUri,
        });
        return postCreatedStore.store(createPost).then(() => RA.ok(createPost));
      }),
      RA.andThrough(({ post, actor }) => {
        const timelineItemEvent = TimelineItem.createTimelineItem({
          timelineItemId: TimelineItemId.generate(),
          type: 'post',
          actorId: actor.id,
          postId: post.aggregateState.postId,
          repostId: null,
          createdAt: now,
        }, now);
        return timelineItemCreatedStore.store(timelineItemEvent);
      }),
      RA.andThrough(async ({ post, attachments }) => {
        if (attachments.length === 0) {
          return RA.ok(undefined);
        }
        const images: PostImage[] = attachments.map((attachment) => ({
          imageId: ImageId.generate(),
          postId: post.aggregateState.postId,
          url: attachment.url,
          altText: attachment.altText,
          createdAt: now,
        }));
        await postImageCreatedStore.store(images);
        return RA.ok(undefined);
      }),
      // Fetch and store link previews
      RA.andThrough(async ({ post, content }) => {
        const env = Env.getInstance();
        const excludeHost = new URL(env.ORIGIN).host;
        const urls = extractUrlsFromHtml(content, excludeHost);

        if (urls.length === 0) {
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
                postId: post.aggregateState.postId,
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
      RA.andThrough(async ({ post, actor, inReplyToUri }) => {
        if (!inReplyToUri) {
          return RA.ok(undefined);
        }
        const originalPostResult = await localPostResolverByUri.resolve({ uri: inReplyToUri });
        if (!originalPostResult.ok || !originalPostResult.val) {
          // Not a local post, skip notification
          return RA.ok(undefined);
        }
        const originalPost: LocalPost = originalPostResult.val;
        // Create reply notification
        const notificationId = NotificationId.generate();
        const notification: ReplyNotification = {
          type: 'reply',
          notificationId,
          recipientUserId: originalPost.userId,
          isRead: false,
          replierActorId: actor.id,
          replyPostId: post.aggregateState.postId,
          originalPostId: originalPost.postId,
        };
        const event = Notification.createReplyNotification(notification, now);
        await replyNotificationCreatedStore.store(event);
        return RA.ok(undefined);
      }),
      // Send web push notification for reply
      RA.andThrough(async ({ actor, inReplyToUri }) => {
        if (!inReplyToUri) {
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
      RA.map(({ post, actor }) => ({ post, actor })),
    );
  };

  return { run };
};

export const AddRemotePostUseCase = {
  create,
} as const;
