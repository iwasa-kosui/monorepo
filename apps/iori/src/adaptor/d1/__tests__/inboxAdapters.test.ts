import { describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { ArticleId } from '../../../domain/article/articleId.ts';
import { EmojiReactId } from '../../../domain/emojiReact/emojiReactId.ts';
import { FederatedTimelineItemId } from '../../../domain/federatedTimeline/federatedTimelineItemId.ts';
import { LikeId } from '../../../domain/like/likeId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { PushSubscriptionId } from '../../../domain/pushSubscription/pushSubscriptionId.ts';
import { RelayId } from '../../../domain/relay/relayId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createInboxListener } from '../../fedify/inboxListener/inboxListenerFactory.ts';
import { createD1ArticleResolver } from '../article/articleResolver.ts';
import type { IoriD1Db } from '../client.ts';
import { createD1EmojiReactsResolverByPostId } from '../emojiReact/emojiReactsResolverByPostId.ts';
import { createD1FederatedTimelineItemsResolverByPostId } from '../federatedTimeline/federatedTimelineItemsResolverByPostId.ts';
import { createD1LikesResolverByPostId } from '../like/likesResolverByPostId.ts';
import { createD1RemoteLikeResolverByActivityUri } from '../like/remoteLikeResolverByActivityUri.ts';
import { createD1PushSubscriptionsResolverByUserId } from '../pushSubscription/pushSubscriptionsResolverByUserId.ts';
import { createD1RelayResolverByActorUri } from '../relay/relayResolverByActorUri.ts';

const queryDb = (rows: unknown[]) => {
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    leftJoin: () => builder,
    where: () => builder,
    limit: async () => rows,
    then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
  };
  return { select: () => builder } as unknown as IoriD1Db;
};

describe('D1 inbox adapters', () => {
  it('reconstructs relay, remote-like, Article, and push-subscription rows', async () => {
    const now = new Date('2026-08-05T00:00:00.000Z');
    const relayId = RelayId.generate();
    const actorId = ActorId.generate();
    const postId = PostId.generate();
    const likeId = LikeId.generate();
    const articleId = ArticleId.generate();
    const userId = UserId.generate();

    const relay = await createD1RelayResolverByActorUri(queryDb([{
      relayId,
      inboxUrl: 'https://relay.example/inbox',
      actorUri: 'https://relay.example/actor',
      status: 'accepted',
      createdAt: now,
      acceptedAt: now,
    }])).resolve({ actorUri: 'https://relay.example/actor' });
    const like = await createD1RemoteLikeResolverByActivityUri(queryDb([{
      likes: { likeId, actorId, postId, type: 'remote', createdAt: now },
      remote_likes: { likeId, likeActivityUri: 'https://remote.example/likes/1' },
    }])).resolve({ likeActivityUri: 'https://remote.example/likes/1' });
    const article = await createD1ArticleResolver(queryDb([{
      articleId,
      authorActorId: actorId,
      authorUserId: userId,
      rootPostId: postId,
      title: 'D1 Article',
      status: 'published',
      createdAt: now,
      publishedAt: now,
      unpublishedAt: null,
    }])).resolve(articleId);
    const subscriptionId = PushSubscriptionId.generate();
    const subscriptions = await createD1PushSubscriptionsResolverByUserId(queryDb([{
      subscriptionId,
      userId,
      endpoint: 'https://push.example/subscription',
      p256dhKey: 'p256dh',
      authKey: 'auth',
      createdAt: now,
    }])).resolve(userId);

    expect(relay).toMatchObject({ ok: true, val: { relayId, status: 'accepted' } });
    expect(like).toMatchObject({ ok: true, val: { likeId, actorId, postId, type: 'remote' } });
    expect(article).toMatchObject({ ok: true, val: { articleId, title: 'D1 Article' } });
    expect(subscriptions).toMatchObject({
      ok: true,
      val: [{ subscriptionId }],
    });
  });

  it('constructs every listener from dependencies without importing Node singletons', () => {
    const listener = createInboxListener({
      onAccept: {} as never,
      onActivity: {} as never,
      onAnnounce: {} as never,
      onCreate: {} as never,
      onDelete: {} as never,
      onFollow: {} as never,
      onLike: {} as never,
      onUndo: {} as never,
    });

    expect(Object.values(listener).every((handler) => typeof handler === 'function')).toBe(true);
    expect(Object.keys(listener)).toHaveLength(8);
  });

  it('reconstructs all constraint-relevant post references for deletion', async () => {
    const now = new Date('2026-08-05T00:00:00.000Z');
    const postId = PostId.generate();
    const actorId = ActorId.generate();
    const likeId = LikeId.generate();
    const emojiReactId = EmojiReactId.generate();
    const federatedTimelineItemId = FederatedTimelineItemId.generate();
    const relayId = RelayId.generate();

    const likes = await createD1LikesResolverByPostId(queryDb([{
      likes: { likeId, actorId, postId, type: 'remote', createdAt: now },
      local_likes: null,
      remote_likes: { likeId, likeActivityUri: 'https://remote.example/likes/1' },
    }])).resolve({ postId });
    const reactions = await createD1EmojiReactsResolverByPostId(queryDb([{
      emojiReactId,
      actorId,
      postId,
      emoji: ':wave:',
      emojiReactActivityUri: 'https://remote.example/reactions/1',
      emojiImageUrl: null,
      createdAt: now,
    }])).resolve({ postId });
    const federatedItems = await createD1FederatedTimelineItemsResolverByPostId(queryDb([{
      federatedTimelineItemId,
      postId,
      relayId,
      receivedAt: now,
    }])).resolve({ postId });

    expect(likes).toMatchObject({ ok: true, val: [{ type: 'remote', likeId, postId }] });
    expect(reactions).toMatchObject({ ok: true, val: [{ emojiReactId, postId }] });
    expect(federatedItems).toMatchObject({ ok: true, val: [{ federatedTimelineItemId, postId }] });
  });
});
