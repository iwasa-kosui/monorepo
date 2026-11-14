import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { ActorId } from '../../domain/actor/actorId.ts';
import type { BlockResolver } from '../../domain/block/block.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type { LocalPost } from '../../domain/post/post.ts';
import { PostId } from '../../domain/post/postId.ts';
import type { PushSubscription } from '../../domain/pushSubscription/pushSubscription.ts';
import { AddReceivedEmojiReactUseCase } from '../addReceivedEmojiReact.ts';
import { AddReceivedLikeUseCase } from '../addReceivedLike.ts';
import {
  createMockActorResolverByUri,
  createMockLogoUriUpdatedStore,
  createMockPostResolver,
  createMockRemoteActorCreatedStore,
  createMockWebPushSender,
} from './helper/mockAdaptors.ts';

const actorIdentity = {
  uri: 'https://remote.example.com/users/alice',
  inboxUrl: 'https://remote.example.com/users/alice/inbox',
  username: 'alice',
};

const setup = (blocked: boolean | undefined) => {
  const postResolver = createMockPostResolver();
  const post: LocalPost = {
    type: 'local',
    visibility: 'public',
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
  const blockResolver: BlockResolver | undefined = blocked === undefined
    ? undefined
    : { resolve: vi.fn(() => RA.ok(blocked ? ({} as never) : undefined)) };
  const notificationStore = { store: vi.fn(() => RA.ok(undefined)) };
  const webPushSender = createMockWebPushSender();
  const common = {
    postResolver,
    remoteActorCreatedStore: createMockRemoteActorCreatedStore(),
    logoUriUpdatedStore: createMockLogoUriUpdatedStore(),
    actorResolverByUri: createMockActorResolverByUri(),
    pushSubscriptionsResolver: {
      resolve: vi.fn(() => RA.ok([{ endpoint: 'https://push.example.com/1' } as PushSubscription])),
    },
    webPushSender,
    blockResolver,
  };
  return { post, blockResolver, notificationStore, webPushSender, common };
};

describe.each(
  [
    ['いいね', 'like'],
    ['絵文字リアクション', 'emojiReact'],
  ] as const,
)('リモートの%sの通知', (_label, kind) => {
  const run = async (blocked: boolean | undefined) => {
    const t = setup(blocked);
    const result = kind === 'like'
      ? await AddReceivedLikeUseCase.create({
        ...t.common,
        remoteLikeCreatedStore: { store: vi.fn(() => RA.ok(undefined)) },
        remoteLikeResolverByActivityUri: { resolve: () => RA.ok(undefined) },
        likeNotificationCreatedStore: t.notificationStore,
      }).run({
        likeActivityUri: 'https://remote.example.com/activities/1',
        likedPostId: t.post.postId,
        likerIdentity: actorIdentity,
      })
      : await AddReceivedEmojiReactUseCase.create({
        ...t.common,
        emojiReactCreatedStore: { store: vi.fn(() => RA.ok(undefined)) },
        emojiReactResolverByActivityUri: { resolve: () => RA.ok(undefined) },
        emojiReactNotificationCreatedStore: t.notificationStore,
      }).run({
        emojiReactActivityUri: 'https://remote.example.com/activities/1',
        reactedPostId: t.post.postId,
        reactorIdentity: actorIdentity,
        emoji: ':blobcat:',
      });
    return { ...t, result };
  };

  it('受信ユーザーがブロックしている相手なら、通知を作らず Web Push も送らない', async () => {
    const t = await run(true);

    expect(t.result.ok).toBe(true);
    expect(t.notificationStore.store).not.toHaveBeenCalled();
    expect(t.webPushSender.send).not.toHaveBeenCalled();
  });

  it('ブロックしていない相手なら、これまでどおり通知を作って Web Push を送る', async () => {
    const t = await run(false);

    expect(t.result.ok).toBe(true);
    expect(t.notificationStore.store).toHaveBeenCalledOnce();
    expect(t.webPushSender.send).toHaveBeenCalledOnce();
  });
});
