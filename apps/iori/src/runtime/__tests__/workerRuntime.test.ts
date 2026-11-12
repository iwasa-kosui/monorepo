import { describe, expect, it, vi } from 'vitest';

import { createWorkerRuntimePorts } from '../workerRuntime.ts';

describe('createWorkerRuntimePorts', () => {
  it('exposes all D1-backed Worker API and federation ports', async () => {
    const env = {
      DB: {} as never,
      UPLOADS: {} as never,
      FEDIFY_KV: {} as never,
      FEDIFY_QUEUE: {} as never,
      ORIGIN: 'https://worker.example.invalid',
      VAPID_SUBJECT: 'mailto:admin@example.invalid',
    };

    const runtime = await createWorkerRuntimePorts(env, vi.fn());

    expect(runtime.db).toBeDefined();
    expect(runtime.auth.signInUseCase.run).toBeTypeOf('function');
    expect(runtime.oauth.verifyAccessTokenUseCase.run).toBeTypeOf('function');
    expect(runtime.oauth.exchangeTokenUseCase.run).toBeTypeOf('function');
    expect(runtime.mastodon.accountStatsResolver.resolve).toBeTypeOf('function');
    expect(runtime.mastodon.userResolverByUsername.resolve).toBeTypeOf('function');
    expect(runtime.timeline.getTimelineUseCase.run).toBeTypeOf('function');
    expect(runtime.posting.createPostUseCase.run).toBeTypeOf('function');
    expect(runtime.socialActions.sendLikeUseCase.run).toBeTypeOf('function');
    expect(runtime.socialActions.undoLikeUseCase.run).toBeTypeOf('function');
    expect(runtime.socialActions.sendRepostUseCase.run).toBeTypeOf('function');
    expect(runtime.socialActions.undoRepostUseCase.run).toBeTypeOf('function');
    expect(runtime.socialActions.sendEmojiReactUseCase.run).toBeTypeOf('function');
    expect(runtime.socialActions.undoEmojiReactUseCase.run).toBeTypeOf('function');
    expect(runtime.socialActions.fetchRemoteContextUseCase.run).toBeTypeOf('function');
    expect(runtime.socialActions.fetchRemoteOutboxUseCase.run).toBeTypeOf('function');
    expect(runtime.mastodon.notificationsResolverByPage.resolve).toBeTypeOf('function');
    expect(runtime.mastodon.notificationResolverByUserIdAndId.resolve).toBeTypeOf('function');
    expect(runtime.mastodon.notificationCountResolverSinceMarker.resolve).toBeTypeOf('function');
    expect(runtime.mastodon.markersResolverByUserId.resolve).toBeTypeOf('function');
    expect(runtime.mastodon.saveMarkersUseCase.run).toBeTypeOf('function');
    expect(runtime.mastodon.dismissNotificationUseCase.run).toBeTypeOf('function');
    expect(runtime.mastodon.clearNotificationsUseCase.run).toBeTypeOf('function');
    expect(runtime.mastodon.resolveRemoteAccountUseCase.run).toBeTypeOf('function');
    expect(runtime.mastodon.repostResolver.resolve).toBeTypeOf('function');
    expect(runtime.core.followRemoteActor).toBeTypeOf('function');
    expect(runtime.core.unfollowRemoteActor).toBeTypeOf('function');
    expect(runtime.articles.getArticleWithThreadUseCase.run).toBeTypeOf('function');
    expect(runtime.articles.getArticlesUseCase.run).toBeTypeOf('function');
    expect(runtime.articles.createArticleUseCase.run).toBeTypeOf('function');
    expect(runtime.articles.publishArticleUseCase.run).toBeTypeOf('function');
    expect(runtime.articles.unpublishArticleUseCase.run).toBeTypeOf('function');
    expect(runtime.articles.deleteArticleUseCase.run).toBeTypeOf('function');
    expect(runtime.articles.publishedArticlesResolver.resolve).toBeTypeOf('function');
    expect(runtime.articles.publishOgImage).toBeTypeOf('function');
    expect(runtime.articles.deleteOgImage).toBeTypeOf('function');
    expect(runtime.mutesRelays.createMuteUseCase.run).toBeTypeOf('function');
    expect(runtime.mutesRelays.deleteMuteUseCase.run).toBeTypeOf('function');
    expect(runtime.mutesRelays.subscribeRelayUseCase.run).toBeTypeOf('function');
    expect(runtime.mutesRelays.allRelaysResolver.resolve).toBeTypeOf('function');
    expect(runtime.core.signUpUseCase.run).toBeTypeOf('function');
    expect(runtime.core.sendReplyUseCase.run).toBeTypeOf('function');
    expect(runtime.core.deletePostUseCase.run).toBeTypeOf('function');
    expect(runtime.mastodon.localPostsResolverByPage.resolve).toBeTypeOf('function');
    expect(runtime.mastodon.federatedTimelineItemsResolver.resolve).toBeTypeOf('function');
    expect(runtime.mastodon.threadResolver.resolve).toBeTypeOf('function');
    expect(runtime.mastodon.statusAssembler.assemble).toBeTypeOf('function');
    expect(runtime.mastodon.actorIdResolverByAcct.resolve).toBeTypeOf('function');
    expect(runtime.mastodon.accountRelationshipsResolverByActorIds.resolve).toBeTypeOf('function');
    expect(runtime.mastodon.likedPostIdsResolverByActorIdWithPagination.resolve).toBeTypeOf('function');
    expect(runtime.mastodon.mutedActorsResolverByUserIdWithPagination.resolve).toBeTypeOf('function');
    expect(runtime.core.subscribePushUseCase.run).toBeTypeOf('function');
    expect(runtime.uploads).toBeDefined();
    expect(runtime.federation).toBeDefined();
  });
});
