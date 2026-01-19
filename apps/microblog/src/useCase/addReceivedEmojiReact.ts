import { RA } from '@iwasa-kosui/result';

import type { PushPayload, WebPushSender } from '../adaptor/webPush/webPushSender.ts';
import type { Actor, ActorResolverByUri } from '../domain/actor/actor.ts';
import type { RemoteActorCreatedStore } from '../domain/actor/remoteActor.ts';
import type { LogoUriUpdatedStore } from '../domain/actor/updateLogoUri.ts';
import {
  AlreadyReactedError,
  EmojiReact,
  type EmojiReactCreatedStore,
  type EmojiReactResolverByActivityUri,
} from '../domain/emojiReact/emojiReact.ts';
import { EmojiReactId } from '../domain/emojiReact/emojiReactId.ts';
import { Instant } from '../domain/instant/instant.ts';
import {
  type EmojiReactNotification,
  type EmojiReactNotificationCreatedStore,
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
  emojiReactActivityUri: string;
  reactedPostId: PostId;
  reactorIdentity: ActorIdentity;
  objectUri: string;
  emoji: string;
  emojiImageUrl?: string | null;
}>;

type Ok = Readonly<{
  emojiReact: EmojiReact;
  actor: Actor;
}>;

type Err = AlreadyReactedError | PostNotLocalError;

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

export type AddReceivedEmojiReactUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  emojiReactCreatedStore: EmojiReactCreatedStore;
  emojiReactResolverByActivityUri: EmojiReactResolverByActivityUri;
  emojiReactNotificationCreatedStore: EmojiReactNotificationCreatedStore;
  postResolver: PostResolver;
  remoteActorCreatedStore: RemoteActorCreatedStore;
  logoUriUpdatedStore: LogoUriUpdatedStore;
  actorResolverByUri: ActorResolverByUri;
  pushSubscriptionsResolver: PushSubscriptionsResolverByUserId;
  webPushSender: WebPushSender;
}>;

const isLocalPost = (post: Post): post is LocalPost => post.type === 'local';

const create = ({
  emojiReactCreatedStore,
  emojiReactResolverByActivityUri,
  emojiReactNotificationCreatedStore,
  postResolver,
  remoteActorCreatedStore,
  logoUriUpdatedStore,
  actorResolverByUri,
  pushSubscriptionsResolver,
  webPushSender,
}: Deps): AddReceivedEmojiReactUseCase => {
  const run = async (input: Input) => {
    const now = Instant.now();

    return RA.flow(
      RA.ok(input),
      RA.andBind(
        'existingReact',
        ({ emojiReactActivityUri }) => emojiReactResolverByActivityUri.resolve({ emojiReactActivityUri }),
      ),
      RA.andThen(({ existingReact, ...rest }) => {
        if (existingReact) {
          return RA.err(AlreadyReactedError.create({
            actorId: existingReact.actorId,
            objectUri: existingReact.objectUri,
            emoji: existingReact.emoji,
          }));
        }
        return RA.ok(rest);
      }),
      RA.andBind('post', ({ reactedPostId }) => postResolver.resolve(reactedPostId)),
      RA.andThen(({ post, ...rest }) => {
        if (!post || !isLocalPost(post)) {
          return RA.err(PostNotLocalError.create(rest.reactedPostId));
        }
        return RA.ok({ ...rest, post });
      }),
      RA.andBind('actor', ({ reactorIdentity }) =>
        upsertRemoteActor({
          now,
          remoteActorCreatedStore,
          logoUriUpdatedStore,
          actorResolverByUri,
        })(reactorIdentity)),
      RA.andBind('emojiReact', ({ actor, objectUri, emojiReactActivityUri, emoji }) => {
        const emojiReactId = EmojiReactId.generate();
        const emojiReact: EmojiReact = {
          emojiReactId,
          actorId: actor.id,
          objectUri,
          emoji,
          emojiReactActivityUri,
        };
        const event = EmojiReact.createEmojiReact(emojiReact, now);
        return emojiReactCreatedStore.store(event).then(() => RA.ok(emojiReact));
      }),
      RA.andThrough(({ post, actor, emoji, emojiImageUrl }) => {
        const notificationId = NotificationId.generate();
        const notification: EmojiReactNotification = {
          type: 'emojiReact',
          notificationId,
          recipientUserId: post.userId,
          isRead: false,
          reactorActorId: actor.id,
          reactedPostId: post.postId,
          emoji,
          emojiImageUrl: emojiImageUrl ?? null,
        };
        const event = Notification.createEmojiReactNotification(notification, now);
        return emojiReactNotificationCreatedStore.store(event);
      }),
      RA.andThrough(({ post, actor, emoji }) => {
        const reactorName = actor.type === 'remote' && actor.username ? actor.username : 'Someone';
        const payload: PushPayload = {
          title: 'New Reaction',
          body: `${reactorName} reacted with ${emoji} to your post`,
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
      RA.map(({ emojiReact, actor }) => ({ emojiReact, actor })),
    );
  };

  return { run };
};

export const AddReceivedEmojiReactUseCase = {
  create,
} as const;
