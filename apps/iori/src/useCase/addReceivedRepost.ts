import { RA } from '@iwasa-kosui/result';

import type { PushPayload, WebPushSender } from '../adaptor/webPush/webPush.ts';
import type { Actor, ActorResolverByUri } from '../domain/actor/actor.ts';
import type { RemoteActorCreatedStore } from '../domain/actor/remoteActor.ts';
import type { LogoUriUpdatedStore } from '../domain/actor/updateLogoUri.ts';
import { Instant } from '../domain/instant/instant.ts';
import {
  Notification,
  type RepostNotification,
  type RepostNotificationCreatedStore,
  type RepostNotificationResolverByRecipientAndActorIdAndPostId,
} from '../domain/notification/notification.ts';
import { NotificationId } from '../domain/notification/notificationId.ts';
import {
  type LocalPost,
  type PostResolver,
  type RemotePost,
  type RemotePostAttachment,
  type RemotePostUpserter,
} from '../domain/post/post.ts';
import type { PostId } from '../domain/post/postId.ts';
import type { Visibility } from '../domain/post/visibility.ts';
import type { PushSubscriptionsResolverByUserId } from '../domain/pushSubscription/pushSubscription.ts';
import {
  AlreadyRepostedError,
  Repost,
  type RepostCreatedStore,
  type RepostResolver,
  type RepostResolverByActivityUri,
} from '../domain/repost/repost.ts';
import { RepostId } from '../domain/repost/repostId.ts';
import { TimelineItem, type TimelineItemCreatedStore } from '../domain/timeline/timelineItem.ts';
import { TimelineItemId } from '../domain/timeline/timelineItemId.ts';
import { upsertRemoteActor } from './helper/upsertRemoteActor.ts';
import type { UseCase } from './useCase.ts';

type ActorIdentity = Readonly<{
  uri: string;
  inboxUrl: string;
  url?: string;
  username?: string;
  logoUri?: string;
}>;

type RemotePostIdentity = Readonly<{
  uri: string;
  content: string;
  authorIdentity: ActorIdentity;
  summary?: string | null;
  sensitive?: boolean;
  visibility: Visibility | null;
  recipientActorUris?: ReadonlyArray<string>;
  attachments?: readonly RemotePostAttachment[];
}>;

type LocalPostInput = Readonly<{
  type: 'local';
  announceActivityUri: string;
  repostedPostId: PostId;
  reposterIdentity: ActorIdentity;
}>;

type RemotePostInput = Readonly<{
  type: 'remote';
  announceActivityUri: string;
  reposterIdentity: ActorIdentity;
  remotePostIdentity: RemotePostIdentity;
}>;

type Input = LocalPostInput | RemotePostInput;

type Ok = Readonly<{
  repost: Repost;
  actor: Actor;
}>;

export type PostNotLocalError = Readonly<{
  type: 'PostNotLocalError';
  message: string;
  detail: {
    postId: PostId;
  };
}>;

export const PostNotLocalError = {
  create: (postId: PostId): PostNotLocalError => ({
    type: 'PostNotLocalError',
    message: `The post with ID "${postId}" is not a local post.`,
    detail: { postId },
  }),
} as const;

type Err = AlreadyRepostedError | PostNotLocalError;

export type AddReceivedRepostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  repostCreatedStore: RepostCreatedStore;
  repostResolverByActivityUri: RepostResolverByActivityUri;
  repostResolver: RepostResolver;
  repostNotificationCreatedStore: RepostNotificationCreatedStore;
  repostNotificationResolver: RepostNotificationResolverByRecipientAndActorIdAndPostId;
  postResolver: PostResolver;
  remotePostUpserter: RemotePostUpserter;
  remoteActorCreatedStore: RemoteActorCreatedStore;
  logoUriUpdatedStore: LogoUriUpdatedStore;
  actorResolverByUri: ActorResolverByUri;
  timelineItemCreatedStore: TimelineItemCreatedStore;
  pushSubscriptionsResolver: PushSubscriptionsResolverByUserId;
  webPushSender: WebPushSender;
}>;

const isLocalPost = (post: LocalPost | RemotePost): post is LocalPost => post.type === 'local';

const create = ({
  repostCreatedStore,
  repostResolverByActivityUri,
  repostResolver,
  repostNotificationCreatedStore,
  repostNotificationResolver,
  postResolver,
  remotePostUpserter,
  remoteActorCreatedStore,
  logoUriUpdatedStore,
  actorResolverByUri,
  timelineItemCreatedStore,
  pushSubscriptionsResolver,
  webPushSender,
}: Deps): AddReceivedRepostUseCase => {
  const notifyRepost = (post: LocalPost, actor: Actor, now: Instant) =>
    RA.flow(
      RA.ok({ post, actor }),
      RA.andThrough(({ post, actor }) => {
        const notification: RepostNotification = {
          type: 'repost',
          notificationId: NotificationId.generate(),
          recipientUserId: post.userId,
          isRead: false,
          reposterActorId: actor.id,
          repostedPostId: post.postId,
        };
        return repostNotificationCreatedStore.store(Notification.createRepostNotification(notification, now));
      }),
      RA.andThrough(({ post, actor }) => {
        const reposterName = actor.type === 'remote' && actor.username ? actor.username : 'Someone';
        const payload: PushPayload = {
          title: 'New Boost',
          body: `${reposterName} boosted your post`,
          url: '/notifications',
        };
        return RA.flow(
          pushSubscriptionsResolver.resolve(post.userId),
          RA.andThen(async (subscriptions) => {
            for (const subscription of subscriptions) {
              await webPushSender.send(subscription, payload);
            }
            return RA.ok(undefined);
          }),
        );
      }),
    );

  const runLocalPostRepost = async (input: LocalPostInput, now: Instant) => {
    return RA.flow(
      RA.ok(input),
      RA.andBind(
        'existingRepostByActivityUri',
        ({ announceActivityUri }) => repostResolverByActivityUri.resolve({ announceActivityUri }),
      ),
      RA.andBind('post', ({ repostedPostId }) => postResolver.resolve(repostedPostId)),
      RA.andThen(({ post, ...rest }) => {
        if (!post || !isLocalPost(post)) {
          return RA.err(PostNotLocalError.create(rest.repostedPostId));
        }
        return RA.ok({ ...rest, post });
      }),
      RA.andBind('actor', ({ reposterIdentity }) =>
        upsertRemoteActor({
          now,
          remoteActorCreatedStore,
          logoUriUpdatedStore,
          actorResolverByUri,
        })(reposterIdentity)),
      RA.andBind(
        'existingRepost',
        ({ existingRepostByActivityUri, actor, post }) =>
          existingRepostByActivityUri === undefined
            ? repostResolver.resolve({ actorId: actor.id, postId: post.postId })
            : RA.ok<Repost | undefined>(existingRepostByActivityUri),
      ),
      RA.andThen(({ existingRepost, actor, post, announceActivityUri }) => {
        if (existingRepost) {
          return RA.flow(
            repostNotificationResolver.resolve({
              recipientUserId: post.userId,
              reposterActorId: actor.id,
              repostedPostId: post.postId,
            }),
            RA.andThen((existingNotification) => {
              if (existingNotification) {
                return RA.err(AlreadyRepostedError.create({
                  actorId: existingRepost.actorId,
                  postId: existingRepost.postId,
                }));
              }
              return RA.flow(
                notifyRepost(post, actor, now),
                RA.map(() => ({ repost: existingRepost, actor })),
              );
            }),
          );
        }
        return RA.flow(
          RA.ok({ actor, post, announceActivityUri }),
          RA.andBind('repost', ({ actor, announceActivityUri, post }) => {
            const repostId = RepostId.generate();
            const repost: Repost = {
              repostId,
              actorId: actor.id,
              postId: post.postId,
              announceActivityUri,
            };
            const event = Repost.createRepost(repost, now);
            return repostCreatedStore.store(event).then(() => RA.ok(repost));
          }),
          RA.andThrough(({ repost, actor, post }) => {
            const timelineItemEvent = TimelineItem.createTimelineItem({
              timelineItemId: TimelineItemId.generate(),
              type: 'repost',
              actorId: actor.id,
              postId: post.postId,
              repostId: repost.repostId,
              createdAt: now,
            }, now);
            return timelineItemCreatedStore.store(timelineItemEvent);
          }),
          RA.andThrough(({ post, actor }) =>
            RA.flow(
              repostNotificationResolver.resolve({
                recipientUserId: post.userId,
                reposterActorId: actor.id,
                repostedPostId: post.postId,
              }),
              RA.andThen((existingNotification) =>
                existingNotification ? RA.ok(undefined) : notifyRepost(post, actor, now)
              ),
            )
          ),
          RA.map(({ repost, actor }) => ({ repost, actor })),
        );
      }),
    );
  };

  const runRemotePostRepost = async (input: RemotePostInput, now: Instant) => {
    return RA.flow(
      RA.ok(input),
      RA.andBind(
        'existingRepost',
        ({ announceActivityUri }) => repostResolverByActivityUri.resolve({ announceActivityUri }),
      ),
      RA.andThen(({ existingRepost, ...rest }) => {
        if (existingRepost) {
          return RA.err(AlreadyRepostedError.create({
            actorId: existingRepost.actorId,
            postId: existingRepost.postId,
          }));
        }
        return RA.ok(rest);
      }),
      // Upsert the reposter (remote actor who did the repost)
      RA.andBind('actor', ({ reposterIdentity }) =>
        upsertRemoteActor({
          now,
          remoteActorCreatedStore,
          logoUriUpdatedStore,
          actorResolverByUri,
        })(reposterIdentity)),
      // Get or create the remote post being reposted
      RA.andBind('post', ({ remotePostIdentity }) => remotePostUpserter.resolve(remotePostIdentity)),
      // Create and store the repost
      RA.andBind('repost', ({ actor, announceActivityUri, post }) => {
        const repostId = RepostId.generate();
        const repost: Repost = {
          repostId,
          actorId: actor.id,
          postId: post.postId,
          announceActivityUri,
        };
        const event = Repost.createRepost(repost, now);
        return repostCreatedStore.store(event).then(() => RA.ok(repost));
      }),
      // Create TimelineItem for the repost
      RA.andThrough(({ repost, actor, post }) => {
        const timelineItemEvent = TimelineItem.createTimelineItem({
          timelineItemId: TimelineItemId.generate(),
          type: 'repost',
          actorId: actor.id,
          postId: post.postId,
          repostId: repost.repostId,
          createdAt: now,
        }, now);
        return timelineItemCreatedStore.store(timelineItemEvent);
      }),
      RA.map(({ repost, actor }) => ({ repost, actor })),
    );
  };

  const run = async (input: Input) => {
    const now = Instant.now();

    if (input.type === 'local') {
      return runLocalPostRepost(input, now);
    }
    return runRemotePostRepost(input, now);
  };

  return { run };
};

export const AddReceivedRepostUseCase = {
  create,
} as const;
