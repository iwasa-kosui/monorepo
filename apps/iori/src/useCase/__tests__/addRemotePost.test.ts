import { test as fcTest } from '@fast-check/vitest';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { ActorId } from '../../domain/actor/actorId.ts';
import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { RemoteActor } from '../../domain/actor/remoteActor.ts';
import type { ImageId } from '../../domain/image/imageId.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import type { LinkPreviewId } from '../../domain/linkPreview/linkPreviewId.ts';
import type { NotificationId } from '../../domain/notification/notificationId.ts';
import type { LocalPost, RemotePost } from '../../domain/post/post.ts';
import type { PostId } from '../../domain/post/postId.ts';
import type { TimelineItemId } from '../../domain/timeline/timelineItemId.ts';
import type { UserId } from '../../domain/user/userId.ts';
import { AddRemotePostUseCase } from '../addRemotePost.ts';

vi.mock('../../env.ts', () => ({
  Env: {
    getInstance: () => ({
      ORIGIN: 'https://example.com',
    }),
  },
}));
import { arbContent } from './helper/arbitraries.ts';
import {
  createMockActorResolverByUri,
  createMockLinkPreviewCreatedStore,
  createMockLinkPreviewsResolver,
  createMockLocalPostResolverByUri,
  createMockLogoUriUpdatedStore,
  createMockMentionNotificationCreatedStore,
  createMockMentionNotificationResolver,
  createMockOgpFetcher,
  createMockPostCreatedStore,
  createMockPostImageCreatedStore,
  createMockPostImagesResolver,
  createMockPostResolverByUri,
  createMockPushSubscriptionsResolverByUserId,
  createMockRemoteActorCreatedStore,
  createMockReplyNotificationCreatedStore,
  createMockReplyNotificationsResolverByReplyPostId,
  createMockTimelineItemCreatedStore,
  createMockTimelineItemsResolverByPostId,
  createMockWebPushSender,
} from './helper/mockAdaptors.ts';

describe('AddRemotePostUseCase', () => {
  const createDeps = () => {
    const postCreatedStore = createMockPostCreatedStore();
    const postResolverByUri = createMockPostResolverByUri();
    const postImageCreatedStore = createMockPostImageCreatedStore();
    const postImagesResolver = createMockPostImagesResolver();
    const remoteActorCreatedStore = createMockRemoteActorCreatedStore();
    const logoUriUpdatedStore = createMockLogoUriUpdatedStore();
    const actorResolverByUri = createMockActorResolverByUri();
    const timelineItemCreatedStore = createMockTimelineItemCreatedStore();
    const timelineItemsResolverByPostId = createMockTimelineItemsResolverByPostId();
    const localPostResolverByUri = createMockLocalPostResolverByUri();
    const replyNotificationCreatedStore = createMockReplyNotificationCreatedStore();
    const replyNotificationsResolverByReplyPostId = createMockReplyNotificationsResolverByReplyPostId();
    const mentionNotificationCreatedStore = createMockMentionNotificationCreatedStore();
    const mentionNotificationResolver = createMockMentionNotificationResolver(mentionNotificationCreatedStore);
    const pushSubscriptionsResolver = createMockPushSubscriptionsResolverByUserId();
    const webPushSender = createMockWebPushSender();
    const linkPreviewCreatedStore = createMockLinkPreviewCreatedStore();
    const linkPreviewsResolver = createMockLinkPreviewsResolver();
    const ogpFetcher = createMockOgpFetcher();
    return {
      origin: 'https://blog.kosui.me',
      postCreatedStore,
      postResolverByUri,
      postImageCreatedStore,
      postImagesResolver,
      remoteActorCreatedStore,
      logoUriUpdatedStore,
      actorResolverByUri,
      timelineItemCreatedStore,
      timelineItemsResolverByPostId,
      localPostResolverByUri,
      replyNotificationCreatedStore,
      replyNotificationsResolverByReplyPostId,
      mentionNotificationCreatedStore,
      mentionNotificationResolver,
      pushSubscriptionsResolver,
      webPushSender,
      linkPreviewCreatedStore,
      linkPreviewsResolver,
      ogpFetcher,
    };
  };

  describe('正常系', () => {
    it('リモート投稿を追加できる', async () => {
      const deps = createDeps();

      const useCase = AddRemotePostUseCase.create(deps);

      const result = await useCase.run({
        content: 'Hello from remote!',
        uri: 'https://remote.example.com/posts/1',
        actorIdentity: {
          uri: 'https://remote.example.com/users/remote',
          inboxUrl: 'https://remote.example.com/inbox',
          url: 'https://remote.example.com/@remote',
          username: 'remote',
        },
        visibility: null,
        attachments: [],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.post.content).toBe('Hello from remote!');
        expect(result.val.post.type).toBe('remote');
        expect(deps.postCreatedStore.store).toHaveBeenCalledTimes(1);
      }
    });

    it('受信した公開範囲を投稿に記録する', async () => {
      const deps = createDeps();

      const useCase = AddRemotePostUseCase.create(deps);

      const result = await useCase.run({
        content: 'Followers only',
        uri: 'https://remote.example.com/posts/visibility',
        actorIdentity: {
          uri: 'https://remote.example.com/users/remote',
          inboxUrl: 'https://remote.example.com/inbox',
        },
        visibility: 'private',
        attachments: [],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.post).toMatchObject({ type: 'remote', visibility: 'private' });
        expect(deps.postCreatedStore.store).toHaveBeenCalledWith(
          expect.objectContaining({ aggregateState: expect.objectContaining({ visibility: 'private' }) }),
        );
      }
    });

    it('受信した宛先を投稿の作成イベントに渡す', async () => {
      const deps = createDeps();

      const useCase = AddRemotePostUseCase.create(deps);

      await useCase.run({
        content: 'Direct',
        uri: 'https://remote.example.com/posts/direct',
        actorIdentity: {
          uri: 'https://remote.example.com/users/remote',
          inboxUrl: 'https://remote.example.com/inbox',
        },
        visibility: 'direct',
        recipientActorUris: ['https://iori.test/users/kosui'],
        attachments: [],
      });

      expect(deps.postCreatedStore.store).toHaveBeenCalledWith(
        expect.objectContaining({
          eventPayload: expect.objectContaining({ recipientActorUris: ['https://iori.test/users/kosui'] }),
        }),
      );
    });

    it('direct の投稿は、作者と Mention タグの相手と宛先を参加者として作成イベントに渡す', async () => {
      const deps = createDeps();

      await AddRemotePostUseCase.create(deps).run({
        content: 'Direct',
        uri: 'https://remote.example.com/posts/direct',
        actorIdentity: {
          uri: 'https://remote.example.com/users/remote',
          inboxUrl: 'https://remote.example.com/inbox',
        },
        visibility: 'direct',
        recipientActorUris: ['https://iori.test/users/kosui'],
        mentionedActorUris: ['https://iori.test/users/kosui', 'https://other.example/users/bob'],
        attachments: [],
      });

      expect(deps.postCreatedStore.store).toHaveBeenCalledWith(
        expect.objectContaining({
          eventPayload: expect.objectContaining({
            participantActorUris: [
              'https://remote.example.com/users/remote',
              'https://iori.test/users/kosui',
              'https://other.example/users/bob',
            ],
          }),
        }),
      );
    });

    it('受信した引用先の URI を投稿の作成イベントに渡す', async () => {
      const deps = createDeps();

      const useCase = AddRemotePostUseCase.create(deps);

      await useCase.run({
        content: 'Quote',
        uri: 'https://remote.example.com/posts/quote',
        actorIdentity: {
          uri: 'https://remote.example.com/users/remote',
          inboxUrl: 'https://remote.example.com/inbox',
        },
        visibility: 'public',
        quoteUri: 'https://remote.example.com/posts/quoted',
        attachments: [],
      });

      expect(deps.postCreatedStore.store).toHaveBeenCalledWith(
        expect.objectContaining({
          eventPayload: expect.objectContaining({ quoteUri: 'https://remote.example.com/posts/quoted' }),
        }),
      );
    });

    it('引用先の URI が無ければ投稿の作成イベントに null を渡す', async () => {
      const deps = createDeps();

      const useCase = AddRemotePostUseCase.create(deps);

      await useCase.run({
        content: 'Plain',
        uri: 'https://remote.example.com/posts/plain',
        actorIdentity: {
          uri: 'https://remote.example.com/users/remote',
          inboxUrl: 'https://remote.example.com/inbox',
        },
        visibility: 'public',
        attachments: [],
      });

      expect(deps.postCreatedStore.store).toHaveBeenCalledWith(
        expect.objectContaining({ eventPayload: expect.objectContaining({ quoteUri: null }) }),
      );
    });

    it('画像付きリモート投稿を追加できる', async () => {
      const deps = createDeps();

      const useCase = AddRemotePostUseCase.create(deps);

      const result = await useCase.run({
        content: 'Post with images',
        uri: 'https://remote.example.com/posts/2',
        actorIdentity: {
          uri: 'https://remote.example.com/users/remote',
          inboxUrl: 'https://remote.example.com/inbox',
          url: 'https://remote.example.com/@remote',
          username: 'remote',
        },
        visibility: null,
        attachments: [
          { url: 'https://remote.example.com/image1.png', altText: 'Image 1', mediaType: null },
          { url: 'https://remote.example.com/image2.png', altText: null, mediaType: null },
        ],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(deps.postImageCreatedStore.store).toHaveBeenCalledTimes(1);
      }
    });

    it.each([
      { attachmentCount: 0, description: '画像なし' },
      { attachmentCount: 1, description: '画像1枚' },
      { attachmentCount: 4, description: '画像4枚' },
    ])('$description のリモート投稿を追加できる', async ({ attachmentCount }) => {
      const deps = createDeps();

      const attachments = Array.from({ length: attachmentCount }, (_, i) => ({
        url: `https://remote.example.com/image${i}.png`,
        altText: `Image ${i}`,
        mediaType: null,
      }));

      const useCase = AddRemotePostUseCase.create(deps);

      const result = await useCase.run({
        content: 'Test post',
        uri: `https://remote.example.com/posts/${attachmentCount}`,
        actorIdentity: {
          uri: 'https://remote.example.com/users/remote',
          inboxUrl: 'https://remote.example.com/inbox',
          url: 'https://remote.example.com/@remote',
          username: 'remote',
        },
        visibility: null,
        attachments,
      });

      expect(result.ok).toBe(true);
      if (attachmentCount > 0) {
        expect(deps.postImageCreatedStore.store).toHaveBeenCalledTimes(1);
      } else {
        expect(deps.postImageCreatedStore.store).not.toHaveBeenCalled();
      }
    });

    fcTest.prop([arbContent()])(
      'プロパティ: 任意のコンテンツでリモート投稿を追加できる',
      async (content) => {
        const deps = createDeps();

        const useCase = AddRemotePostUseCase.create(deps);

        const result = await useCase.run({
          content,
          uri: `https://remote.example.com/posts/${crypto.randomUUID()}`,
          actorIdentity: {
            uri: 'https://remote.example.com/users/remote',
            inboxUrl: 'https://remote.example.com/inbox',
            url: 'https://remote.example.com/@remote',
            username: 'remote',
          },
          visibility: null,
          attachments: [],
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.val.post.content).toBe(content);
        }
      },
    );
  });

  describe('副作用の検証', () => {
    it('postCreatedStore が呼ばれる', async () => {
      const deps = createDeps();

      const useCase = AddRemotePostUseCase.create(deps);

      await useCase.run({
        content: 'Test',
        uri: 'https://remote.example.com/posts/1',
        actorIdentity: {
          uri: 'https://remote.example.com/users/remote',
          inboxUrl: 'https://remote.example.com/inbox',
        },
        visibility: null,
        attachments: [],
      });

      expect(deps.postCreatedStore.store).toHaveBeenCalledTimes(1);
    });

    it('remoteActorCreatedStore が新規アクターで呼ばれる', async () => {
      const deps = createDeps();

      const useCase = AddRemotePostUseCase.create(deps);

      await useCase.run({
        content: 'Test',
        uri: 'https://remote.example.com/posts/1',
        actorIdentity: {
          uri: 'https://remote.example.com/users/new',
          inboxUrl: 'https://remote.example.com/inbox',
          url: 'https://remote.example.com/@new',
          username: 'new',
        },
        visibility: null,
        attachments: [],
      });

      expect(deps.remoteActorCreatedStore.store).toHaveBeenCalled();
    });

    it('画像付き投稿で postImageCreatedStore が呼ばれる', async () => {
      const deps = createDeps();

      const useCase = AddRemotePostUseCase.create(deps);

      await useCase.run({
        content: 'Test with image',
        uri: 'https://remote.example.com/posts/1',
        actorIdentity: {
          uri: 'https://remote.example.com/users/remote',
          inboxUrl: 'https://remote.example.com/inbox',
        },
        visibility: null,
        attachments: [
          { url: 'https://remote.example.com/image.png', altText: 'Test image', mediaType: null },
        ],
      });

      expect(deps.postImageCreatedStore.store).toHaveBeenCalledTimes(1);
    });
  });

  describe('アクター情報', () => {
    it('logoUri を持つアクターの投稿を追加できる', async () => {
      const deps = createDeps();

      const useCase = AddRemotePostUseCase.create(deps);

      const result = await useCase.run({
        content: 'Test',
        uri: 'https://remote.example.com/posts/1',
        actorIdentity: {
          uri: 'https://remote.example.com/users/remote',
          inboxUrl: 'https://remote.example.com/inbox',
          url: 'https://remote.example.com/@remote',
          username: 'remote',
          logoUri: 'https://remote.example.com/avatar.png',
        },
        visibility: null,
        attachments: [],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.actor).toBeDefined();
      }
    });

    it('最小限の情報を持つアクターの投稿を追加できる', async () => {
      const deps = createDeps();

      const useCase = AddRemotePostUseCase.create(deps);

      const result = await useCase.run({
        content: 'Test',
        uri: 'https://remote.example.com/posts/1',
        actorIdentity: {
          uri: 'https://remote.example.com/users/minimal',
          inboxUrl: 'https://remote.example.com/inbox',
        },
        visibility: null,
        attachments: [],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.actor.uri).toBe('https://remote.example.com/users/minimal');
      }
    });
  });

  describe('冪等性', () => {
    const actorUri = 'https://remote.example.com/users/remote';
    const postUri = 'https://remote.example.com/posts/idempotent';
    const content = '<p>reply <a href="https://news.example.org/article">link</a></p>';
    const attachments = [{ url: 'https://remote.example.com/image.png', altText: 'Image', mediaType: null }];
    const actor = {
      id: 'actor-remote' as ActorId,
      type: 'remote',
      uri: actorUri,
      inboxUrl: 'https://remote.example.com/inbox',
    } as RemoteActor;
    const originalPost = {
      type: 'local',
      postId: 'post-original' as PostId,
      actorId: 'actor-local' as ActorId,
      content: 'original',
      createdAt: 0 as Instant,
      userId: 'user-local' as UserId,
      inReplyToUri: null,
    } as LocalPost;
    const inReplyToUri = 'https://iori.test/posts/original';
    const existingPost = {
      type: 'remote',
      postId: 'post-existing' as PostId,
      actorId: actor.id,
      content,
      createdAt: 0 as Instant,
      uri: postUri,
      inReplyToUri,
      visibility: null,
    } as RemotePost;
    const timelineItem = {
      timelineItemId: 'timeline-item-1' as TimelineItemId,
      type: 'post' as const,
      actorId: actor.id,
      postId: existingPost.postId,
      repostId: null,
      createdAt: 0 as Instant,
    };
    const image = {
      imageId: 'image-1' as ImageId,
      postId: existingPost.postId,
      url: attachments[0].url,
      altText: 'Image',
      mediaType: null,
      createdAt: 0 as Instant,
    };
    const linkPreview = {
      linkPreviewId: 'link-preview-1' as LinkPreviewId,
      postId: existingPost.postId,
      url: 'https://news.example.org/article',
      title: 'Article',
      description: null,
      imageUrl: null,
      faviconUrl: null,
      siteName: null,
      createdAt: 0 as Instant,
    };
    const replyNotification = {
      type: 'reply' as const,
      notificationId: 'notification-1' as NotificationId,
      recipientUserId: originalPost.userId,
      isRead: false,
      replierActorId: actor.id,
      replyPostId: existingPost.postId,
      originalPostId: originalPost.postId,
    };
    const input = {
      content,
      uri: postUri,
      actorIdentity: { uri: actorUri, inboxUrl: actor.inboxUrl },
      attachments,
      inReplyToUri,
      visibility: null,
    };
    const createIdempotencyDeps = () => {
      const deps = {
        ...createDeps(),
        pushSubscriptionsResolver: {
          resolve: vi.fn(() => RA.ok([{ endpoint: 'https://push.example.com/1' }] as never)),
        },
        ogpFetcher: {
          fetch: vi.fn(async () => ({
            title: 'Article',
            description: null,
            imageUrl: null,
            faviconUrl: null,
            siteName: null,
          })),
        },
      };
      deps.actorResolverByUri.setActor(actor);
      deps.localPostResolverByUri.setPost(inReplyToUri, originalPost);
      return deps;
    };

    it('URI の投稿が既にあり後続も揃っているとき、何も作らず Web Push も送らない', async () => {
      const deps = createIdempotencyDeps();
      deps.postResolverByUri.setPost(existingPost);
      deps.timelineItemsResolverByPostId.setItems(existingPost.postId, [timelineItem]);
      deps.postImagesResolver.setImages(existingPost.postId, [image]);
      deps.linkPreviewsResolver.setPreviews(existingPost.postId, [linkPreview]);
      deps.replyNotificationsResolverByReplyPostId.setNotifications(existingPost.postId, [replyNotification]);

      const result = await AddRemotePostUseCase.create(deps).run(input);

      expect(result.ok && result.val.post.postId).toBe(existingPost.postId);
      expect(deps.postCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.timelineItemCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.postImageCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.ogpFetcher.fetch).not.toHaveBeenCalled();
      expect(deps.linkPreviewCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.replyNotificationCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.webPushSender.send).not.toHaveBeenCalled();
    });

    it('投稿はあるが後続が欠けているとき、欠けたものだけを作り、返信の通知を作ったので Web Push を送る', async () => {
      const deps = createIdempotencyDeps();
      deps.postResolverByUri.setPost(existingPost);
      deps.timelineItemsResolverByPostId.setItems(existingPost.postId, [timelineItem]);

      const result = await AddRemotePostUseCase.create(deps).run(input);

      expect(result.ok && result.val.post.postId).toBe(existingPost.postId);
      expect(deps.postCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.timelineItemCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.postImageCreatedStore.store).toHaveBeenCalledTimes(1);
      expect(deps.postImageCreatedStore.items[0]).toMatchObject([{ postId: existingPost.postId }]);
      expect(deps.linkPreviewCreatedStore.store).toHaveBeenCalledTimes(1);
      expect(deps.linkPreviewCreatedStore.items[0]).toMatchObject([{ postId: existingPost.postId }]);
      expect(deps.replyNotificationCreatedStore.store).toHaveBeenCalledTimes(1);
      expect(deps.replyNotificationCreatedStore.items[0].aggregateState).toMatchObject({
        replyPostId: existingPost.postId,
      });
      expect(deps.webPushSender.send).toHaveBeenCalledTimes(1);
    });

    it('投稿はあるが返信の通知が欠けているとき、通知を作り Web Push を送る', async () => {
      const deps = createIdempotencyDeps();
      deps.postResolverByUri.setPost(existingPost);
      deps.timelineItemsResolverByPostId.setItems(existingPost.postId, [timelineItem]);
      deps.postImagesResolver.setImages(existingPost.postId, [image]);
      deps.linkPreviewsResolver.setPreviews(existingPost.postId, [linkPreview]);

      const result = await AddRemotePostUseCase.create(deps).run(input);

      expect(result.ok && result.val.post.postId).toBe(existingPost.postId);
      expect(deps.postCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.replyNotificationCreatedStore.store).toHaveBeenCalledTimes(1);
      expect(deps.webPushSender.send).toHaveBeenCalledTimes(1);
    });

    it('返信した相手を受信ユーザーがブロックしているとき、返信の通知も Web Push も作らない', async () => {
      const deps = createIdempotencyDeps();
      deps.postResolverByUri.setPost(existingPost);
      deps.timelineItemsResolverByPostId.setItems(existingPost.postId, [timelineItem]);
      deps.postImagesResolver.setImages(existingPost.postId, [image]);
      deps.linkPreviewsResolver.setPreviews(existingPost.postId, [linkPreview]);
      const blockResolver = { resolve: vi.fn(() => RA.ok({} as never)) };

      const result = await AddRemotePostUseCase.create({ ...deps, blockResolver }).run(input);

      expect(result.ok).toBe(true);
      expect(blockResolver.resolve).toHaveBeenCalledWith({ userId: originalPost.userId, blockedActorId: actor.id });
      expect(deps.replyNotificationCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.webPushSender.send).not.toHaveBeenCalled();
    });

    it('返信した相手をブロックしていないとき、これまでどおり返信の通知と Web Push を作る', async () => {
      const deps = createIdempotencyDeps();
      deps.postResolverByUri.setPost(existingPost);
      deps.timelineItemsResolverByPostId.setItems(existingPost.postId, [timelineItem]);
      deps.postImagesResolver.setImages(existingPost.postId, [image]);
      deps.linkPreviewsResolver.setPreviews(existingPost.postId, [linkPreview]);
      const blockResolver = { resolve: vi.fn(() => RA.ok(undefined)) };

      await AddRemotePostUseCase.create({ ...deps, blockResolver }).run(input);

      expect(deps.replyNotificationCreatedStore.store).toHaveBeenCalledTimes(1);
      expect(deps.webPushSender.send).toHaveBeenCalledTimes(1);
    });

    it('投稿も返信の通知もあるとき、Web Push を送らない', async () => {
      const deps = createIdempotencyDeps();
      deps.postResolverByUri.setPost(existingPost);
      deps.replyNotificationsResolverByReplyPostId.setNotifications(existingPost.postId, [replyNotification]);

      await AddRemotePostUseCase.create(deps).run(input);

      expect(deps.replyNotificationCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.webPushSender.send).not.toHaveBeenCalled();
    });

    it('保存の前の確認で別のアクターの投稿が見つかったとき、専用のエラーを返し、何も作らず Web Push も送らない', async () => {
      const deps = createIdempotencyDeps();
      deps.postResolverByUri.setPost({ ...existingPost, actorId: 'actor-other' as ActorId });

      const result = await AddRemotePostUseCase.create(deps).run(input);

      expect(!result.ok && result.err).toEqual({
        type: 'RemotePostAuthorMismatchError',
        message: expect.any(String),
        detail: { uri: postUri, existingActorId: 'actor-other', actorId: actor.id },
      });
      expect(deps.postCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.timelineItemCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.postImageCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.linkPreviewCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.replyNotificationCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.webPushSender.send).not.toHaveBeenCalled();
    });

    it('保存の失敗後の引き直しで別のアクターの投稿が見つかったとき、専用のエラーを返し、何も作らない', async () => {
      const deps = createIdempotencyDeps();
      vi.mocked(deps.postCreatedStore.store).mockImplementationOnce(
        (async () => {
          deps.postResolverByUri.setPost({ ...existingPost, actorId: 'actor-other' as ActorId });
          throw new Error('UNIQUE constraint failed: remote_posts.uri');
        }) as never,
      );

      const result = await AddRemotePostUseCase.create(deps).run(input);

      expect(!result.ok && result.err).toMatchObject({
        type: 'RemotePostAuthorMismatchError',
        detail: { uri: postUri, existingActorId: 'actor-other', actorId: actor.id },
      });
      expect(deps.timelineItemCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.postImageCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.linkPreviewCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.replyNotificationCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.webPushSender.send).not.toHaveBeenCalled();
    });

    it('別のアクターのタイムライン項目しか無いとき、タイムライン項目を作る', async () => {
      const deps = createIdempotencyDeps();
      deps.postResolverByUri.setPost(existingPost);
      deps.timelineItemsResolverByPostId.setItems(existingPost.postId, [
        { ...timelineItem, actorId: 'actor-other' as ActorId },
      ]);

      await AddRemotePostUseCase.create(deps).run(input);

      expect(deps.timelineItemCreatedStore.store).toHaveBeenCalledTimes(1);
    });

    it('保存が失敗し、引き直すと投稿があるとき、既存の投稿として続け、通知が既にあれば Web Push は送らない', async () => {
      const deps = createIdempotencyDeps();
      deps.replyNotificationsResolverByReplyPostId.setNotifications(existingPost.postId, [replyNotification]);
      vi.mocked(deps.postCreatedStore.store).mockImplementationOnce(
        (async () => {
          deps.postResolverByUri.setPost(existingPost);
          throw new Error('UNIQUE constraint failed: remote_posts.uri');
        }) as never,
      );

      const result = await AddRemotePostUseCase.create(deps).run(input);

      expect(result.ok && result.val.post.postId).toBe(existingPost.postId);
      expect(deps.postResolverByUri.resolve).toHaveBeenCalledTimes(2);
      expect(deps.timelineItemCreatedStore.store).toHaveBeenCalledTimes(1);
      expect(deps.webPushSender.send).not.toHaveBeenCalled();
    });

    it('保存が失敗し、引き直しても投稿が無いとき、元の例外を投げ直す', async () => {
      const deps = createIdempotencyDeps();
      const failure = new Error('D1_ERROR: database is locked');
      vi.mocked(deps.postCreatedStore.store).mockImplementationOnce(
        (async () => {
          throw failure;
        }) as never,
      );

      await expect(AddRemotePostUseCase.create(deps).run(input)).rejects.toBe(failure);

      expect(deps.timelineItemCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.webPushSender.send).not.toHaveBeenCalled();
    });

    it('引き直しが例外を投げたとき、元の保存のエラーを投げる', async () => {
      const deps = createIdempotencyDeps();
      const failure = new Error('D1_ERROR: database is locked');
      vi.mocked(deps.postCreatedStore.store).mockImplementationOnce(
        (async () => {
          throw failure;
        }) as never,
      );
      vi.mocked(deps.postResolverByUri.resolve)
        .mockResolvedValueOnce(RA.ok(undefined) as never)
        .mockRejectedValueOnce(new Error('D1_ERROR: resolve failed'));

      await expect(AddRemotePostUseCase.create(deps).run(input)).rejects.toBe(failure);

      expect(deps.timelineItemCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.webPushSender.send).not.toHaveBeenCalled();
    });

    it('新しい投稿のとき、全部を作り Web Push を送る', async () => {
      const deps = createIdempotencyDeps();

      const result = await AddRemotePostUseCase.create(deps).run(input);

      expect(result.ok).toBe(true);
      expect(deps.postCreatedStore.store).toHaveBeenCalledTimes(1);
      expect(deps.timelineItemCreatedStore.store).toHaveBeenCalledTimes(1);
      expect(deps.postImageCreatedStore.store).toHaveBeenCalledTimes(1);
      expect(deps.linkPreviewCreatedStore.store).toHaveBeenCalledTimes(1);
      expect(deps.replyNotificationCreatedStore.store).toHaveBeenCalledTimes(1);
      expect(deps.webPushSender.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('メンションの通知', () => {
    const remoteUri = 'https://remote.example.com/users/remote';
    const remoteActor = {
      id: 'actor-remote' as ActorId,
      type: 'remote',
      uri: remoteUri,
      inboxUrl: 'https://remote.example.com/inbox',
      username: 'remote',
    } as RemoteActor;
    const localActor = {
      id: 'actor-local' as ActorId,
      type: 'local',
      uri: 'https://iori.test/users/kosui',
      inboxUrl: 'https://iori.test/users/kosui/inbox',
      userId: 'user-local' as UserId,
    } as LocalActor;
    const otherLocalActor = {
      id: 'actor-other-local' as ActorId,
      type: 'local',
      uri: 'https://iori.test/users/other',
      inboxUrl: 'https://iori.test/users/other/inbox',
      userId: 'user-other-local' as UserId,
    } as LocalActor;
    const localPost = {
      type: 'local',
      postId: 'post-local' as PostId,
      actorId: localActor.id,
      content: 'mine',
      createdAt: 0 as Instant,
      userId: localActor.userId,
      inReplyToUri: null,
    } as LocalPost;
    const localPostUri = 'https://iori.test/users/kosui/posts/post-local';
    const existingPost = {
      type: 'remote',
      postId: 'post-mention' as PostId,
      actorId: remoteActor.id,
      content: 'hello',
      createdAt: 0 as Instant,
      uri: 'https://remote.example.com/posts/mention',
      inReplyToUri: null,
      visibility: null,
    } as RemotePost;
    const input = {
      content: '<p>hello</p>',
      uri: existingPost.uri,
      actorIdentity: { uri: remoteUri, inboxUrl: remoteActor.inboxUrl, username: 'remote' },
      attachments: [],
      visibility: 'public' as const,
      recipientActorUris: [localActor.uri],
    };
    const createMentionDeps = () => {
      const deps = {
        ...createDeps(),
        pushSubscriptionsResolver: {
          resolve: vi.fn(() => RA.ok([{ endpoint: 'https://push.example.com/1' }] as never)),
        },
      };
      deps.actorResolverByUri.setActor(remoteActor);
      deps.actorResolverByUri.setActor(localActor);
      return deps;
    };

    it('返信ではないメンションで通知を作り、Web Push を送る', async () => {
      const deps = createMentionDeps();

      const result = await AddRemotePostUseCase.create(deps).run(input);

      expect(result.ok).toBe(true);
      expect(deps.replyNotificationCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.mentionNotificationCreatedStore.store).toHaveBeenCalledTimes(1);
      expect(deps.mentionNotificationCreatedStore.items[0]).toMatchObject({
        eventName: 'notification.mentionNotificationCreated',
        aggregateState: {
          type: 'mention',
          recipientUserId: localActor.userId,
          isRead: false,
          mentionerActorId: remoteActor.id,
          mentionPostId: result.ok ? result.val.post.postId : undefined,
        },
      });
      expect(deps.pushSubscriptionsResolver.resolve).toHaveBeenCalledWith(localActor.userId);
      expect(deps.webPushSender.send).toHaveBeenCalledTimes(1);
      expect(deps.webPushSender.send).toHaveBeenCalledWith(
        { endpoint: 'https://push.example.com/1' },
        { title: 'New Mention', body: 'remote mentioned you', url: '/notifications' },
      );
    });

    it('DM でも通知を作る', async () => {
      const deps = createMentionDeps();

      await AddRemotePostUseCase.create(deps).run({ ...input, visibility: 'direct' });

      expect(deps.mentionNotificationCreatedStore.store).toHaveBeenCalledTimes(1);
      expect(deps.webPushSender.send).toHaveBeenCalledTimes(1);
    });

    it('宛先の複数のローカルアクターそれぞれに通知を作る', async () => {
      const deps = createMentionDeps();
      deps.actorResolverByUri.setActor(otherLocalActor);

      await AddRemotePostUseCase.create(deps).run({
        ...input,
        recipientActorUris: [localActor.uri, otherLocalActor.uri],
      });

      expect(deps.mentionNotificationCreatedStore.items.map((event) => event.aggregateState.recipientUserId))
        .toEqual([localActor.userId, otherLocalActor.userId]);
      expect(deps.webPushSender.send).toHaveBeenCalledTimes(2);
    });

    it('メンションした相手を受信ユーザーがブロックしているとき、メンションの通知も Web Push も作らない', async () => {
      const deps = createMentionDeps();
      const blockResolver = { resolve: vi.fn(() => RA.ok({} as never)) };

      const result = await AddRemotePostUseCase.create({ ...deps, blockResolver }).run(input);

      expect(result.ok).toBe(true);
      expect(blockResolver.resolve).toHaveBeenCalledWith({ userId: localActor.userId, blockedActorId: remoteActor.id });
      expect(deps.mentionNotificationCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.webPushSender.send).not.toHaveBeenCalled();
    });

    it('宛先のうちブロックしていない別のローカルアクターには、メンションの通知を作る', async () => {
      const deps = createMentionDeps();
      deps.actorResolverByUri.setActor(otherLocalActor);
      const blockResolver = {
        resolve: vi.fn(({ userId }: { userId: UserId }) =>
          RA.ok(userId === localActor.userId ? ({} as never) : undefined)
        ),
      };

      await AddRemotePostUseCase.create({ ...deps, blockResolver }).run({
        ...input,
        recipientActorUris: [localActor.uri, otherLocalActor.uri],
      });

      expect(deps.mentionNotificationCreatedStore.items.map((event) => event.aggregateState.recipientUserId))
        .toEqual([otherLocalActor.userId]);
      expect(deps.webPushSender.send).toHaveBeenCalledTimes(1);
    });

    it('blockResolver を渡さないとき、これまでどおりメンションの通知を作る', async () => {
      const deps = createMentionDeps();

      await AddRemotePostUseCase.create(deps).run(input);

      expect(deps.mentionNotificationCreatedStore.store).toHaveBeenCalledTimes(1);
      expect(deps.webPushSender.send).toHaveBeenCalledTimes(1);
    });

    it('自分の投稿への返信と宛先の両方に当たるとき、返信の通知だけを1件作る', async () => {
      const deps = createMentionDeps();
      deps.localPostResolverByUri.setPost(localPostUri, localPost);

      await AddRemotePostUseCase.create(deps).run({ ...input, inReplyToUri: localPostUri });

      expect(deps.replyNotificationCreatedStore.store).toHaveBeenCalledTimes(1);
      expect(deps.mentionNotificationCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.webPushSender.send).toHaveBeenCalledTimes(1);
      expect(deps.webPushSender.send).toHaveBeenCalledWith(
        { endpoint: 'https://push.example.com/1' },
        expect.objectContaining({ title: 'New Reply' }),
      );
    });

    it('返信の通知が既にあるとき、同じ受信者のメンションの通知を作らない', async () => {
      const deps = createMentionDeps();
      deps.localPostResolverByUri.setPost(localPostUri, localPost);
      deps.postResolverByUri.setPost(existingPost);
      deps.replyNotificationsResolverByReplyPostId.setNotifications(existingPost.postId, [{
        type: 'reply',
        notificationId: 'notification-1' as NotificationId,
        recipientUserId: localPost.userId,
        isRead: false,
        replierActorId: remoteActor.id,
        replyPostId: existingPost.postId,
        originalPostId: localPost.postId,
      }]);

      await AddRemotePostUseCase.create(deps).run({ ...input, inReplyToUri: localPostUri });

      expect(deps.replyNotificationCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.mentionNotificationCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.webPushSender.send).not.toHaveBeenCalled();
    });

    it('自分の投稿への返信で、別のローカルアクターにも宛てたとき、その別のアクターにメンションの通知を作る', async () => {
      const deps = createMentionDeps();
      deps.actorResolverByUri.setActor(otherLocalActor);
      deps.localPostResolverByUri.setPost(localPostUri, localPost);

      await AddRemotePostUseCase.create(deps).run({
        ...input,
        inReplyToUri: localPostUri,
        recipientActorUris: [localActor.uri, otherLocalActor.uri],
      });

      expect(deps.replyNotificationCreatedStore.store).toHaveBeenCalledTimes(1);
      expect(deps.mentionNotificationCreatedStore.items.map((event) => event.aggregateState.recipientUserId))
        .toEqual([otherLocalActor.userId]);
      expect(deps.webPushSender.send).toHaveBeenCalledTimes(2);
    });

    it('同じ投稿を2回受け取っても、メンションの通知は1件だけ作る', async () => {
      const deps = createMentionDeps();
      deps.postResolverByUri.setPost(existingPost);
      const useCase = AddRemotePostUseCase.create(deps);

      await useCase.run(input);
      await useCase.run(input);

      expect(deps.mentionNotificationCreatedStore.store).toHaveBeenCalledTimes(1);
      expect(deps.webPushSender.send).toHaveBeenCalledTimes(1);
    });

    it('投稿者が受信者自身のとき、通知を作らない', async () => {
      const deps = createMentionDeps();

      await AddRemotePostUseCase.create(deps).run({
        ...input,
        actorIdentity: { uri: localActor.uri, inboxUrl: localActor.inboxUrl },
      });

      expect(deps.mentionNotificationCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.webPushSender.send).not.toHaveBeenCalled();
    });

    it('ローカルアクターでない宛先と解決できない宛先を無視する', async () => {
      const deps = createMentionDeps();
      const otherRemote = {
        id: 'actor-other-remote' as ActorId,
        type: 'remote',
        uri: 'https://other.example.com/users/other',
        inboxUrl: 'https://other.example.com/inbox',
      } as RemoteActor;
      deps.actorResolverByUri.setActor(otherRemote);

      await AddRemotePostUseCase.create(deps).run({
        ...input,
        recipientActorUris: [otherRemote.uri, 'https://iori.test/users/unknown'],
      });

      expect(deps.mentionNotificationCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.webPushSender.send).not.toHaveBeenCalled();
    });

    it('宛先が無いとき、通知を作らない', async () => {
      const deps = createMentionDeps();

      await AddRemotePostUseCase.create(deps).run({ ...input, recipientActorUris: undefined });

      expect(deps.mentionNotificationCreatedStore.store).not.toHaveBeenCalled();
    });

    it('1人目の宛先の通知の保存が失敗しても、2人目の宛先には通知と Web Push を出し、そのうえで例外を呼び出し元に伝える', async () => {
      const deps = createMentionDeps();
      deps.actorResolverByUri.setActor(otherLocalActor);
      const realStore = deps.mentionNotificationCreatedStore.store;
      deps.mentionNotificationCreatedStore.store = vi.fn((event) => {
        if (event.aggregateState.recipientUserId === localActor.userId) {
          throw new Error('transient store failure');
        }
        return realStore(event);
      }) as typeof realStore;

      await expect(
        AddRemotePostUseCase.create(deps).run({
          ...input,
          recipientActorUris: [localActor.uri, otherLocalActor.uri],
        }),
      ).rejects.toThrow(/Failed to store 1 mention notification\(s\): Error: transient store failure/);

      expect(deps.mentionNotificationCreatedStore.items.map((event) => event.aggregateState.recipientUserId))
        .toEqual([otherLocalActor.userId]);
      expect(deps.pushSubscriptionsResolver.resolve).toHaveBeenCalledTimes(1);
      expect(deps.pushSubscriptionsResolver.resolve).toHaveBeenCalledWith(otherLocalActor.userId);
      expect(deps.webPushSender.send).toHaveBeenCalledTimes(1);
    });

    it('メンション用の依存を渡さないとき、通知を作らずに投稿を追加できる', async () => {
      const {
        mentionNotificationCreatedStore: _store,
        mentionNotificationResolver: _resolver,
        ...deps
      } = createMentionDeps();
      deps.actorResolverByUri.setActor(localActor);

      const result = await AddRemotePostUseCase.create(deps).run(input);

      expect(result.ok).toBe(true);
      expect(deps.webPushSender.send).not.toHaveBeenCalled();
    });
  });
});
