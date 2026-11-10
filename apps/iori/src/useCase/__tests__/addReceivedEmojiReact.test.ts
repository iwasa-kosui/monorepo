import { RA } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import type { ActorId } from '../../domain/actor/actorId.ts';
import type {
  EmojiReactCreated,
  EmojiReactCreatedStore,
  EmojiReactResolverByActivityUri,
} from '../../domain/emojiReact/emojiReact.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type {
  EmojiReactNotificationCreated,
  EmojiReactNotificationCreatedStore,
} from '../../domain/notification/notification.ts';
import type { LocalPost } from '../../domain/post/post.ts';
import { PostId } from '../../domain/post/postId.ts';
import { AddReceivedEmojiReactUseCase } from '../addReceivedEmojiReact.ts';
import {
  createMockActorResolverByUri,
  createMockLogoUriUpdatedStore,
  createMockPostResolver,
  createMockPushSubscriptionsResolverByUserId,
  createMockRemoteActorCreatedStore,
  createMockWebPushSender,
} from './helper/mockAdaptors.ts';

describe('AddReceivedEmojiReactUseCase', () => {
  const createDeps = () => {
    const emojiReactEvents: EmojiReactCreated[] = [];
    const notificationEvents: EmojiReactNotificationCreated[] = [];
    const emojiReactCreatedStore: EmojiReactCreatedStore = {
      store: (...events) => {
        emojiReactEvents.push(...events);
        return RA.ok(undefined);
      },
    };
    const emojiReactNotificationCreatedStore: EmojiReactNotificationCreatedStore = {
      store: (...events) => {
        notificationEvents.push(...events);
        return RA.ok(undefined);
      },
    };
    const emojiReactResolverByActivityUri: EmojiReactResolverByActivityUri = {
      resolve: () => RA.ok(undefined),
    };
    const postResolver = createMockPostResolver();
    const post: LocalPost = {
      type: 'local',
      summary: null,
      sensitive: false,
      postId: PostId.generate(),
      actorId: crypto.randomUUID() as ActorId,
      userId: crypto.randomUUID() as LocalPost['userId'],
      content: '<p>hello</p>',
      createdAt: Instant.orThrow(1),
      inReplyToUri: null,
    };
    postResolver.setPost(post);
    const useCase = AddReceivedEmojiReactUseCase.create({
      emojiReactCreatedStore,
      emojiReactResolverByActivityUri,
      emojiReactNotificationCreatedStore,
      postResolver,
      remoteActorCreatedStore: createMockRemoteActorCreatedStore(),
      logoUriUpdatedStore: createMockLogoUriUpdatedStore(),
      actorResolverByUri: createMockActorResolverByUri(),
      pushSubscriptionsResolver: createMockPushSubscriptionsResolverByUserId(),
      webPushSender: createMockWebPushSender(),
    });
    return { useCase, post, emojiReactEvents, notificationEvents };
  };

  const run = async (emojiImageUrl?: string | null) => {
    const deps = createDeps();
    const result = await deps.useCase.run({
      emojiReactActivityUri: 'https://remote.example.com/activities/1',
      reactedPostId: deps.post.postId,
      reactorIdentity: {
        uri: 'https://remote.example.com/users/alice',
        inboxUrl: 'https://remote.example.com/users/alice/inbox',
      },
      emoji: ':blobcat:',
      ...(emojiImageUrl === undefined ? {} : { emojiImageUrl }),
    });
    return { ...deps, result };
  };

  const httpsUrlOfLength = (length: number): string => {
    const prefix = 'https://remote.example.com/emoji/';
    return `${prefix}${'a'.repeat(length - prefix.length)}`;
  };

  it('2048 文字以内の https の url は EmojiReact と通知にそのまま保存する', async () => {
    const url = httpsUrlOfLength(2048);
    const { result, emojiReactEvents, notificationEvents } = await run(url);

    expect(result.ok).toBe(true);
    expect(emojiReactEvents).toHaveLength(1);
    expect(emojiReactEvents[0]!.aggregateState.emojiImageUrl).toBe(url);
    expect(notificationEvents).toHaveLength(1);
    expect(notificationEvents[0]!.aggregateState.emojiImageUrl).toBe(url);
  });

  it('2049 文字の url は null で保存する', async () => {
    const { result, emojiReactEvents, notificationEvents } = await run(httpsUrlOfLength(2049));

    expect(result.ok).toBe(true);
    expect(emojiReactEvents[0]!.aggregateState.emojiImageUrl).toBeNull();
    expect(notificationEvents[0]!.aggregateState.emojiImageUrl).toBeNull();
  });

  it('http の url は null で保存する', async () => {
    const { result, emojiReactEvents, notificationEvents } = await run('http://remote.example.com/emoji/blobcat.png');

    expect(result.ok).toBe(true);
    expect(emojiReactEvents[0]!.aggregateState.emojiImageUrl).toBeNull();
    expect(notificationEvents[0]!.aggregateState.emojiImageUrl).toBeNull();
  });

  it('url が無いときは null で保存する', async () => {
    const { result, emojiReactEvents, notificationEvents } = await run();

    expect(result.ok).toBe(true);
    expect(emojiReactEvents[0]!.aggregateState.emojiImageUrl).toBeNull();
    expect(notificationEvents[0]!.aggregateState.emojiImageUrl).toBeNull();
  });
});
