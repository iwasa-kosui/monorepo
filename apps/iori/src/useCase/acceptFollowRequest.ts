import { RA } from '@iwasa-kosui/result';

import type { PushPayload, WebPushSender } from '../adaptor/webPush/webPushSender.ts';
import type { Actor, ActorResolverByUri, ActorResolverByUserId } from '../domain/actor/actor.ts';
import type { LocalActor } from '../domain/actor/localActor.ts';
import { RemoteActor, type RemoteActorCreatedStore } from '../domain/actor/remoteActor.ts';
import type { LogoUriUpdatedStore } from '../domain/actor/updateLogoUri.ts';
import { Follow, type FollowAcceptedStore, type FollowResolver } from '../domain/follow/follow.ts';
import { Instant } from '../domain/instant/instant.ts';
import {
  type FollowNotification,
  type FollowNotificationCreatedStore,
  Notification,
} from '../domain/notification/notification.ts';
import { NotificationId } from '../domain/notification/notificationId.ts';
import type { PushSubscriptionsResolverByUserId } from '../domain/pushSubscription/pushSubscription.ts';
import { UserNotFoundError } from '../domain/user/user.ts';
import type { Username } from '../domain/user/username.ts';
import type { UserResolverByUsername } from './../domain/user/user.ts';
import { upsertRemoteActor } from './helper/upsertRemoteActor.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  username: Username;
  follower: Pick<RemoteActor, 'uri' | 'inboxUrl' | 'url' | 'username'>;
}>;

type Ok = Follow;
type Err = UserNotFoundError;

type CreateUserUseCase = UseCase<
  Input,
  Ok,
  Err
>;

type Deps = Readonly<{
  actorResolverByUri: ActorResolverByUri;
  actorResolverByUserId: ActorResolverByUserId;
  userResolverByUsername: UserResolverByUsername;
  remoteActorCreatedStore: RemoteActorCreatedStore;
  logoUriUpdatedStore: LogoUriUpdatedStore;
  followedStore: FollowAcceptedStore;
  followResolver: FollowResolver;
  followNotificationCreatedStore: FollowNotificationCreatedStore;
  pushSubscriptionsResolver: PushSubscriptionsResolverByUserId;
  webPushSender: WebPushSender;
}>;

const isLocalActor = (actor: Actor): actor is LocalActor => actor.type === 'local';

const create = ({
  followedStore,
  followResolver,
  userResolverByUsername,
  remoteActorCreatedStore,
  logoUriUpdatedStore,
  actorResolverByUserId,
  actorResolverByUri,
  followNotificationCreatedStore,
  pushSubscriptionsResolver,
  webPushSender,
}: Deps): CreateUserUseCase => {
  const run = async (input: Input) => {
    const now = Instant.now();

    return RA.flow(
      RA.ok(input),
      RA.andBind('followingActor', ({ username }) =>
        RA.flow(
          userResolverByUsername.resolve(username),
          RA.andThen((user): RA<Actor | undefined, UserNotFoundError> => {
            if (!user) {
              return RA.err(UserNotFoundError.create({ username }));
            }
            return actorResolverByUserId.resolve(user.id);
          }),
          RA.andThen((actor) => {
            if (!actor) {
              return RA.err(UserNotFoundError.create({ username }));
            }
            return RA.ok(actor);
          }),
        )),
      RA.andBind('followerActor', ({ follower }) =>
        upsertRemoteActor({
          now,
          remoteActorCreatedStore,
          logoUriUpdatedStore,
          actorResolverByUri,
        })(follower)),
      RA.andThen(({ username, followingActor, followerActor }) => {
        if (!followingActor) {
          return RA.err(UserNotFoundError.create({ username }));
        }
        return RA.ok({
          followerActor,
          followingActor,
        });
      }),
      RA.andBind('existingFollow', ({ followerActor, followingActor }) =>
        followResolver.resolve({
          followerId: followerActor.id,
          followingId: followingActor.id,
        })),
      RA.andBind('isNewFollow', ({ existingFollow }) => RA.ok(!existingFollow)),
      RA.andThen(({ followerActor, followingActor, existingFollow, isNewFollow }) => {
        if (existingFollow) {
          return RA.ok({ follow: existingFollow, followerActor, followingActor, isNewFollow });
        }
        const followCreated = Follow.acceptFollow({
          followerId: followerActor.id,
          followingId: followingActor.id,
        }, now);
        return RA.flow(
          RA.ok({ follow: followCreated.aggregateState, followerActor, followingActor, isNewFollow }),
          RA.andThrough(() => followedStore.store(followCreated)),
        );
      }),
      // フォロー通知を作成（新規フォローかつローカルアクターの場合のみ）
      RA.andThrough(({ followingActor, followerActor, isNewFollow }) => {
        if (!isNewFollow || !isLocalActor(followingActor)) {
          return RA.ok(undefined);
        }
        const notificationId = NotificationId.generate();
        const notification: FollowNotification = {
          type: 'follow',
          notificationId,
          recipientUserId: followingActor.userId,
          isRead: false,
          followerActorId: followerActor.id,
        };
        const event = Notification.createFollowNotification(notification, now);
        return followNotificationCreatedStore.store(event);
      }),
      // Web Push通知を送信（新規フォローかつローカルアクターの場合のみ）
      RA.andThrough(({ followingActor, followerActor, isNewFollow }) => {
        if (!isNewFollow || !isLocalActor(followingActor)) {
          return RA.ok(undefined);
        }
        const followerName = followerActor.type === 'remote' && followerActor.username
          ? followerActor.username
          : 'Someone';
        const payload: PushPayload = {
          title: 'New Follower',
          body: `${followerName} started following you`,
          url: '/notifications',
        };
        return RA.flow(
          pushSubscriptionsResolver.resolve(followingActor.userId),
          RA.andThen(async (subscriptions) => {
            for (const subscription of subscriptions) {
              await webPushSender.send(subscription, payload);
            }
            return RA.ok(undefined);
          }),
        );
      }),
      RA.map(({ follow }) => follow),
    );
  };

  return { run };
};

export const AcceptFollowRequestUseCase = {
  create,
} as const;
