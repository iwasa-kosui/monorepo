import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { Actor } from '../../domain/actor/actor.ts';
import type { ActorId } from '../../domain/actor/actorId.ts';
import { RemoteActor } from '../../domain/actor/remoteActor.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type {
  RepostNotification,
  RepostNotificationCreated,
  RepostNotificationCreatedStore,
  RepostNotificationResolverByRecipientAndActorIdAndPostId,
} from '../../domain/notification/notification.ts';
import { NotificationId } from '../../domain/notification/notificationId.ts';
import type { LocalPost } from '../../domain/post/post.ts';
import { PostId } from '../../domain/post/postId.ts';
import type { PushSubscription } from '../../domain/pushSubscription/pushSubscription.ts';
import type {
  Repost,
  RepostCreated,
  RepostCreatedStore,
  RepostResolver,
  RepostResolverByActivityUri,
} from '../../domain/repost/repost.ts';
import { RepostId } from '../../domain/repost/repostId.ts';
import { AddReceivedRepostUseCase } from '../addReceivedRepost.ts';
import {
  createMockActorResolverByUri,
  createMockLogoUriUpdatedStore,
  createMockPostResolver,
  createMockRemoteActorCreatedStore,
  createMockTimelineItemCreatedStore,
  createMockWebPushSender,
} from './helper/mockAdaptors.ts';

const reposterIdentity = {
  uri: 'https://remote.example.com/users/alice',
  inboxUrl: 'https://remote.example.com/users/alice/inbox',
  username: 'alice',
};

describe('AddReceivedRepostUseCase (local post)', () => {
  const createDeps = () => {
    const reposts: Repost[] = [];
    const notifications: RepostNotification[] = [];
    const notificationEvents: RepostNotificationCreated[] = [];
    const repostEvents: RepostCreated[] = [];

    const repostCreatedStore: RepostCreatedStore = {
      store: (...events) => {
        for (const event of events) {
          if (
            reposts.some((repost) =>
              repost.actorId === event.aggregateState.actorId && repost.postId === event.aggregateState.postId
            )
          ) {
            throw new Error('UNIQUE constraint failed: reposts.actorId, reposts.postId');
          }
          reposts.push(event.aggregateState);
          repostEvents.push(event);
        }
        return RA.ok(undefined);
      },
    };
    const repostResolverByActivityUri: RepostResolverByActivityUri = {
      resolve: ({ announceActivityUri }) =>
        RA.ok(reposts.find((repost) => repost.announceActivityUri === announceActivityUri)),
    };
    const repostResolver: RepostResolver = {
      resolve: ({ actorId, postId }) =>
        RA.ok(reposts.find((repost) => repost.actorId === actorId && repost.postId === postId)),
    };
    const repostNotificationCreatedStore: RepostNotificationCreatedStore = {
      store: (...events) => {
        notifications.push(...events.map((event) => event.aggregateState));
        notificationEvents.push(...events);
        return RA.ok(undefined);
      },
    };
    const repostNotificationResolver: RepostNotificationResolverByRecipientAndActorIdAndPostId = {
      resolve: ({ recipientUserId, reposterActorId, repostedPostId }) =>
        RA.ok(notifications.find((notification) =>
          notification.recipientUserId === recipientUserId
          && notification.reposterActorId === reposterActorId
          && notification.repostedPostId === repostedPostId
        )),
    };

    const postResolver = createMockPostResolver();
    const post: LocalPost = {
      type: 'local',
      postId: PostId.generate(),
      actorId: crypto.randomUUID() as ActorId,
      userId: crypto.randomUUID() as LocalPost['userId'],
      content: '<p>hello</p>',
      createdAt: Instant.orThrow(1),
      inReplyToUri: null,
    };
    postResolver.setPost(post);

    const reposter: Actor = RemoteActor.createRemoteActor(reposterIdentity).aggregateState;
    const actorResolverByUri = createMockActorResolverByUri();
    actorResolverByUri.setActor(reposter);

    const timelineItemCreatedStore = createMockTimelineItemCreatedStore();
    const subscription = { endpoint: 'https://push.example.com/1' } as PushSubscription;
    const pushSubscriptionsResolver = { resolve: vi.fn(() => RA.ok([subscription])) };
    const webPushSender = createMockWebPushSender();

    const useCase = AddReceivedRepostUseCase.create({
      repostCreatedStore,
      repostResolverByActivityUri,
      repostResolver,
      repostNotificationCreatedStore,
      repostNotificationResolver,
      postResolver,
      remotePostUpserter: { resolve: vi.fn() } as never,
      remoteActorCreatedStore: createMockRemoteActorCreatedStore(),
      logoUriUpdatedStore: createMockLogoUriUpdatedStore(),
      actorResolverByUri,
      timelineItemCreatedStore,
      pushSubscriptionsResolver,
      webPushSender,
    });

    const run = (announceActivityUri: string) =>
      useCase.run({ type: 'local', announceActivityUri, repostedPostId: post.postId, reposterIdentity });

    return {
      run,
      post,
      reposter,
      reposts,
      repostEvents,
      notifications,
      notificationEvents,
      timelineItemCreatedStore,
      webPushSender,
      subscription,
    };
  };

  const seedRepost = (deps: ReturnType<typeof createDeps>, announceActivityUri: string | null) => {
    const repost: Repost = {
      repostId: RepostId.generate(),
      actorId: deps.reposter.id,
      postId: deps.post.postId,
      announceActivityUri,
    };
    deps.reposts.push(repost);
    return repost;
  };

  const seedNotification = (deps: ReturnType<typeof createDeps>) => {
    deps.notifications.push({
      type: 'repost',
      notificationId: NotificationId.generate(),
      recipientUserId: deps.post.userId,
      isRead: false,
      reposterActorId: deps.reposter.id,
      repostedPostId: deps.post.postId,
    });
  };

  it('新しいブーストでは repost と TimelineItem を保存し、通知と Web Push を作る', async () => {
    const deps = createDeps();

    const result = await deps.run('https://remote.example.com/activities/1');

    expect(result.ok).toBe(true);
    expect(deps.repostEvents).toHaveLength(1);
    expect(deps.timelineItemCreatedStore.store).toHaveBeenCalledTimes(1);
    expect(deps.notificationEvents).toHaveLength(1);
    expect(deps.notificationEvents[0]!.eventName).toBe('notification.repostNotificationCreated');
    expect(deps.notifications[0]).toMatchObject({
      type: 'repost',
      recipientUserId: deps.post.userId,
      isRead: false,
      reposterActorId: deps.reposter.id,
      repostedPostId: deps.post.postId,
    });
    expect(deps.webPushSender.send).toHaveBeenCalledTimes(1);
    expect(deps.webPushSender.send).toHaveBeenCalledWith(deps.subscription, {
      title: 'New Boost',
      body: 'alice boosted your post',
      url: '/notifications',
    });
  });

  it('既存の repost があり通知が無いときは、通知と Web Push だけを作って成功で終える', async () => {
    const deps = createDeps();
    const existing = seedRepost(deps, 'https://remote.example.com/activities/1');

    const result = await deps.run('https://remote.example.com/activities/1');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.val.repost).toEqual(existing);
    expect(deps.repostEvents).toHaveLength(0);
    expect(deps.timelineItemCreatedStore.store).not.toHaveBeenCalled();
    expect(deps.notificationEvents).toHaveLength(1);
    expect(deps.webPushSender.send).toHaveBeenCalledTimes(1);
  });

  it('活動 URI が違っても同じ actor と投稿の repost があり通知が無いときは、通知だけを作る', async () => {
    const deps = createDeps();
    seedRepost(deps, 'https://remote.example.com/activities/old');

    const result = await deps.run('https://remote.example.com/activities/2');

    expect(result.ok).toBe(true);
    expect(deps.repostEvents).toHaveLength(0);
    expect(deps.notificationEvents).toHaveLength(1);
    expect(deps.webPushSender.send).toHaveBeenCalledTimes(1);
  });

  it('既存の repost と通知があるときは AlreadyRepostedError で終え、通知も Web Push も作らない', async () => {
    const deps = createDeps();
    seedRepost(deps, 'https://remote.example.com/activities/1');
    seedNotification(deps);

    const result = await deps.run('https://remote.example.com/activities/1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.err.type).toBe('AlreadyRepostedError');
    expect(deps.repostEvents).toHaveLength(0);
    expect(deps.notificationEvents).toHaveLength(0);
    expect(deps.webPushSender.send).not.toHaveBeenCalled();
  });

  it('別の活動 URI で同じ actor が同じ投稿を2回ブーストしても、例外を出さず通知を増やさない', async () => {
    const deps = createDeps();

    const first = await deps.run('https://remote.example.com/activities/1');
    const second = await deps.run('https://remote.example.com/activities/2');

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.err.type).toBe('AlreadyRepostedError');
    expect(deps.repostEvents).toHaveLength(1);
    expect(deps.notificationEvents).toHaveLength(1);
    expect(deps.webPushSender.send).toHaveBeenCalledTimes(1);
  });
});
