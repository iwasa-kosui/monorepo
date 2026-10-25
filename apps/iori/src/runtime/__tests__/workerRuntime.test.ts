import { describe, expect, it } from 'vitest';

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

    const runtime = await createWorkerRuntimePorts(env);

    expect(runtime.db).toBeDefined();
    expect(runtime.auth.signInUseCase.run).toBeTypeOf('function');
    expect(runtime.timeline.getTimelineUseCase.run).toBeTypeOf('function');
    expect(runtime.posting.createPostUseCase.run).toBeTypeOf('function');
    expect(runtime.socialActions.sendLikeUseCase.run).toBeTypeOf('function');
    expect(runtime.socialActions.undoLikeUseCase.run).toBeTypeOf('function');
    expect(runtime.socialActions.sendRepostUseCase.run).toBeTypeOf('function');
    expect(runtime.socialActions.undoRepostUseCase.run).toBeTypeOf('function');
    expect(runtime.socialActions.sendEmojiReactUseCase.run).toBeTypeOf('function');
    expect(runtime.socialActions.undoEmojiReactUseCase.run).toBeTypeOf('function');
    expect(runtime.notifications.getUnreadNotificationCountUseCase.run).toBeTypeOf('function');
    expect(runtime.notifications.getNotificationsUseCase.run).toBeTypeOf('function');
    expect(runtime.notifications.getLikedPostsUseCase.run).toBeTypeOf('function');
    expect(runtime.articles.getArticleWithThreadUseCase.run).toBeTypeOf('function');
    expect(runtime.articles.getArticlesUseCase.run).toBeTypeOf('function');
    expect(runtime.articles.createArticleUseCase.run).toBeTypeOf('function');
    expect(runtime.articles.publishArticleUseCase.run).toBeTypeOf('function');
    expect(runtime.articles.unpublishArticleUseCase.run).toBeTypeOf('function');
    expect(runtime.articles.deleteArticleUseCase.run).toBeTypeOf('function');
    expect(runtime.articles.publishedArticlesResolver.resolve).toBeTypeOf('function');
    expect(runtime.articles.publishOgImage).toBeTypeOf('function');
    expect(runtime.mutesRelays.getMutesUseCase.run).toBeTypeOf('function');
    expect(runtime.mutesRelays.createMuteUseCase.run).toBeTypeOf('function');
    expect(runtime.mutesRelays.deleteMuteUseCase.run).toBeTypeOf('function');
    expect(runtime.mutesRelays.subscribeRelayUseCase.run).toBeTypeOf('function');
    expect(runtime.mutesRelays.allRelaysResolver.resolve).toBeTypeOf('function');
    expect(runtime.core.signUpUseCase.run).toBeTypeOf('function');
    expect(runtime.core.sendReplyUseCase.run).toBeTypeOf('function');
    expect(runtime.core.deletePostUseCase.run).toBeTypeOf('function');
    expect(runtime.core.sendFollowRequestUseCase.run).toBeTypeOf('function');
    expect(runtime.core.getFederatedTimelineUseCase.run).toBeTypeOf('function');
    expect(runtime.core.getUserPostsUseCase.run).toBeTypeOf('function');
    expect(runtime.core.getRemoteActorPostsUseCase.run).toBeTypeOf('function');
    expect(runtime.core.getServerTimelineUseCase.run).toBeTypeOf('function');
    expect(runtime.core.threadResolver.resolve).toBeTypeOf('function');
    expect(runtime.core.subscribePushUseCase.run).toBeTypeOf('function');
    expect(runtime.core.unsubscribePushUseCase.run).toBeTypeOf('function');
    expect(runtime.uploads).toBeDefined();
    expect(runtime.federation).toBeDefined();
  });
});
