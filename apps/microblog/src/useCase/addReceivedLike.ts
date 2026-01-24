import { RA } from '@iwasa-kosui/result';

import type { PushPayload, WebPushSender } from '../adaptor/webPush/webPushSender.ts';
import type { Actor, ActorResolverByUri } from '../domain/actor/actor.ts';
import type { RemoteActorCreatedStore } from '../domain/actor/remoteActor.ts';
import type { LogoUriUpdatedStore } from '../domain/actor/updateLogoUri.ts';
import { Instant } from '../domain/instant/instant.ts';
import {
  AlreadyLikedError,
  Like,
  type RemoteLike,
  type RemoteLikeCreatedStore,
  type RemoteLikeResolverByActivityUri,
} from '../domain/like/like.ts';
import { LikeId } from '../domain/like/likeId.ts';
import {
  type LikeNotification,
  type LikeNotificationCreatedStore,
  Notification,
} from '../domain/notification/notification.ts';
import { NotificationId } from '../domain/notification/notificationId.ts';
import type { LocalPost, Post, PostResolver } from '../domain/post/post.ts';
import type { PostId } from '../domain/post/postId.ts';
import type { PushSubscriptionsResolverByUserId } from '../domain/pushSubscription/pushSubscription.ts';
import { upsertRemoteActor } from './helper/upsertRemoteActor.ts';
import type { UseCase } from './useCase.ts';

type ActorIdentity = Readonly<{
  uri: string;
  inboxUrl: string;
  url?: string;
  username?: string;
  logoUri?: string;
}>;

type Input = Readonly<{
  likeActivityUri: string;
  likedPostId: PostId;
  likerIdentity: ActorIdentity;
}>;

type Ok = Readonly<{
  like: RemoteLike;
  actor: Actor;
}>;

type Err = AlreadyLikedError | PostNotLocalError;

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

export type AddReceivedLikeUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  remoteLikeCreatedStore: RemoteLikeCreatedStore;
  remoteLikeResolverByActivityUri: RemoteLikeResolverByActivityUri;
  likeNotificationCreatedStore: LikeNotificationCreatedStore;
  postResolver: PostResolver;
  remoteActorCreatedStore: RemoteActorCreatedStore;
  logoUriUpdatedStore: LogoUriUpdatedStore;
  actorResolverByUri: ActorResolverByUri;
  pushSubscriptionsResolver: PushSubscriptionsResolverByUserId;
  webPushSender: WebPushSender;
}>;

const isLocalPost = (post: Post): post is LocalPost => post.type === 'local';

const create = ({
  remoteLikeCreatedStore,
  remoteLikeResolverByActivityUri,
  likeNotificationCreatedStore,
  postResolver,
  remoteActorCreatedStore,
  logoUriUpdatedStore,
  actorResolverByUri,
  pushSubscriptionsResolver,
  webPushSender,
}: Deps): AddReceivedLikeUseCase => {
  const run = async (input: Input) => {
    const now = Instant.now();

    return RA.flow(
      RA.ok(input),
      RA.andBind(
        'existingLike',
        ({ likeActivityUri }) => remoteLikeResolverByActivityUri.resolve({ likeActivityUri }),
      ),
      RA.andThen(({ existingLike, ...rest }) => {
        if (existingLike) {
          return RA.err(AlreadyLikedError.create({
            actorId: existingLike.actorId,
            postId: existingLike.postId,
          }));
        }
        return RA.ok(rest);
      }),
      RA.andBind('post', ({ likedPostId }) => postResolver.resolve(likedPostId)),
      RA.andThen(({ post, ...rest }) => {
        if (!post || !isLocalPost(post)) {
          return RA.err(PostNotLocalError.create(rest.likedPostId));
        }
        return RA.ok({ ...rest, post });
      }),
      RA.andBind('actor', ({ likerIdentity }) =>
        upsertRemoteActor({
          now,
          remoteActorCreatedStore,
          logoUriUpdatedStore,
          actorResolverByUri,
        })(likerIdentity)),
      RA.andBind('like', ({ actor, likedPostId, likeActivityUri }) => {
        const likeId = LikeId.generate();
        const event = Like.createRemoteLike(
          {
            likeId,
            actorId: actor.id,
            postId: likedPostId,
            likeActivityUri,
          },
          now,
        );
        return remoteLikeCreatedStore.store(event).then(() => RA.ok(event.aggregateState));
      }),
      RA.andThrough(({ post, actor }) => {
        const notificationId = NotificationId.generate();
        const notification: LikeNotification = {
          type: 'like',
          notificationId,
          recipientUserId: post.userId,
          isRead: false,
          likerActorId: actor.id,
          likedPostId: post.postId,
        };
        const event = Notification.createLikeNotification(notification, now);
        return likeNotificationCreatedStore.store(event);
      }),
      RA.andThrough(({ post, actor }) => {
        const likerName = actor.type === 'remote' && actor.username ? actor.username : 'Someone';
        const payload: PushPayload = {
          title: 'New Like',
          body: `${likerName} liked your post`,
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
      RA.map(({ like, actor }) => ({ like, actor })),
    );
  };

  return { run };
};

export const AddReceivedLikeUseCase = {
  create,
} as const;
