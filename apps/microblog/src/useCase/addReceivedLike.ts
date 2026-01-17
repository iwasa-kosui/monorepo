import { RA } from '@iwasa-kosui/result';

import type { Actor, ActorResolverByUri } from '../domain/actor/actor.ts';
import type { RemoteActorCreatedStore } from '../domain/actor/remoteActor.ts';
import type { LogoUriUpdatedStore } from '../domain/actor/updateLogoUri.ts';
import { Instant } from '../domain/instant/instant.ts';
import { Notification, type NotificationCreatedStore, NotificationType } from '../domain/notification/notification.ts';
import { NotificationId } from '../domain/notification/notificationId.ts';
import type { LocalPost, Post, PostResolver } from '../domain/post/post.ts';
import type { PostId } from '../domain/post/postId.ts';
import {
  AlreadyReceivedLikeError,
  ReceivedLike,
  type ReceivedLikeCreatedStore,
  type ReceivedLikeResolverByActivityUri,
} from '../domain/receivedLike/receivedLike.ts';
import { ReceivedLikeId } from '../domain/receivedLike/receivedLikeId.ts';
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
  receivedLike: ReceivedLike;
  actor: Actor;
}>;

type Err = AlreadyReceivedLikeError | PostNotLocalError;

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
  receivedLikeCreatedStore: ReceivedLikeCreatedStore;
  receivedLikeResolverByActivityUri: ReceivedLikeResolverByActivityUri;
  notificationCreatedStore: NotificationCreatedStore;
  postResolver: PostResolver;
  remoteActorCreatedStore: RemoteActorCreatedStore;
  logoUriUpdatedStore: LogoUriUpdatedStore;
  actorResolverByUri: ActorResolverByUri;
}>;

const isLocalPost = (post: Post): post is LocalPost => post.type === 'local';

const create = ({
  receivedLikeCreatedStore,
  receivedLikeResolverByActivityUri,
  notificationCreatedStore,
  postResolver,
  remoteActorCreatedStore,
  logoUriUpdatedStore,
  actorResolverByUri,
}: Deps): AddReceivedLikeUseCase => {
  const run = async (input: Input) => {
    const now = Instant.now();

    return RA.flow(
      RA.ok(input),
      RA.andBind(
        'existingLike',
        ({ likeActivityUri }) => receivedLikeResolverByActivityUri.resolve({ likeActivityUri }),
      ),
      RA.andThen(({ existingLike, ...rest }) => {
        if (existingLike) {
          return RA.err(AlreadyReceivedLikeError.create({ likeActivityUri: rest.likeActivityUri }));
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
      RA.andBind('receivedLike', ({ actor, likedPostId, likeActivityUri }) => {
        const receivedLikeId = ReceivedLikeId.generate();
        const receivedLike: ReceivedLike = {
          receivedLikeId,
          likerActorId: actor.id,
          likedPostId,
          likeActivityUri,
        };
        const event = ReceivedLike.createReceivedLike(receivedLike, now);
        return receivedLikeCreatedStore.store(event).then(() => RA.ok(receivedLike));
      }),
      RA.andThrough(({ post, actor }) => {
        const notificationId = NotificationId.generate();
        const notification: Notification = {
          notificationId,
          recipientUserId: post.userId,
          type: NotificationType.like,
          relatedActorId: actor.id,
          relatedPostId: post.postId,
          isRead: false,
        };
        const event = Notification.createNotification(notification, now);
        return notificationCreatedStore.store(event);
      }),
      RA.map(({ receivedLike, actor }) => ({ receivedLike, actor })),
    );
  };

  return { run };
};

export const AddReceivedLikeUseCase = {
  create,
} as const;
