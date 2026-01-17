import { test as fcTest } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';

import { AddRemotePostUseCase } from '../addRemotePost.ts';
import { arbContent } from './helper/arbitraries.ts';
import {
  createMockActorResolverByUri,
  createMockLogoUriUpdatedStore,
  createMockPostCreatedStore,
  createMockPostImageCreatedStore,
  createMockRemoteActorCreatedStore,
  createMockTimelineItemCreatedStore,
} from './helper/mockAdaptors.ts';

describe('AddRemotePostUseCase', () => {
  const createDeps = () => {
    const postCreatedStore = createMockPostCreatedStore();
    const postImageCreatedStore = createMockPostImageCreatedStore();
    const remoteActorCreatedStore = createMockRemoteActorCreatedStore();
    const logoUriUpdatedStore = createMockLogoUriUpdatedStore();
    const actorResolverByUri = createMockActorResolverByUri();
    const timelineItemCreatedStore = createMockTimelineItemCreatedStore();
    return {
      postCreatedStore,
      postImageCreatedStore,
      remoteActorCreatedStore,
      logoUriUpdatedStore,
      actorResolverByUri,
      timelineItemCreatedStore,
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
        attachments: [],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.post.aggregateState.content).toBe('Hello from remote!');
        expect(result.val.post.aggregateState.type).toBe('remote');
        expect(deps.postCreatedStore.store).toHaveBeenCalledTimes(1);
      }
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
        attachments: [
          { url: 'https://remote.example.com/image1.png', altText: 'Image 1' },
          { url: 'https://remote.example.com/image2.png', altText: null },
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
          attachments: [],
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.val.post.aggregateState.content).toBe(content);
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
        attachments: [
          { url: 'https://remote.example.com/image.png', altText: 'Test image' },
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
        attachments: [],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.actor.uri).toBe('https://remote.example.com/users/minimal');
      }
    });
  });
});
