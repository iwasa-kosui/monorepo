import { test as fcTest } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';

import type { LocalPost } from '../../domain/post/post.ts';
import type { PostId } from '../../domain/post/postId.ts';
import { GetPostUseCase } from '../getPost.ts';
import { arbLocalPost, arbPostId } from './helper/arbitraries.ts';
import { createMockPostImagesResolver, createMockPostResolver } from './helper/mockAdaptors.ts';

describe('GetPostUseCase', () => {
  const createDeps = () => {
    const postResolver = createMockPostResolver();
    const postImagesResolver = createMockPostImagesResolver();
    return {
      postResolver,
      postImagesResolver,
    };
  };

  describe('正常系', () => {
    it('投稿を取得できる', async () => {
      const deps = createDeps();
      const post: LocalPost = {
        type: 'local',
        postId: crypto.randomUUID() as PostId,
        actorId: crypto.randomUUID() as LocalPost['actorId'],
        content: 'Hello, world!',
        createdAt: Date.now() as LocalPost['createdAt'],
        userId: crypto.randomUUID() as LocalPost['userId'],
        inReplyToUri: null,
      };
      deps.postResolver.setPost(post);

      const useCase = GetPostUseCase.create(deps);
      const result = await useCase.run({ postId: post.postId });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.post.postId).toBe(post.postId);
        expect(result.val.post.content).toBe('Hello, world!');
        expect(result.val.postImages).toEqual([]);
      }
    });

    it('投稿と画像を取得できる', async () => {
      const deps = createDeps();
      const post: LocalPost = {
        type: 'local',
        postId: crypto.randomUUID() as PostId,
        actorId: crypto.randomUUID() as LocalPost['actorId'],
        content: 'Post with images',
        createdAt: Date.now() as LocalPost['createdAt'],
        userId: crypto.randomUUID() as LocalPost['userId'],
        inReplyToUri: null,
      };
      const images = [
        {
          imageId: crypto.randomUUID() as string,
          postId: post.postId,
          url: 'https://example.com/image1.png',
          altText: 'Image 1',
          createdAt: Date.now(),
        },
      ];
      deps.postResolver.setPost(post);
      deps.postImagesResolver.setImages(post.postId, images as never);

      const useCase = GetPostUseCase.create(deps);
      const result = await useCase.run({ postId: post.postId });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.postImages).toHaveLength(1);
        expect(result.val.postImages[0].url).toBe('https://example.com/image1.png');
      }
    });

    fcTest.prop([arbLocalPost()])(
      'プロパティ: 登録済みの投稿は必ず取得できる',
      async (post) => {
        const deps = createDeps();
        deps.postResolver.setPost(post);

        const useCase = GetPostUseCase.create(deps);
        const result = await useCase.run({ postId: post.postId });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.val.post.postId).toBe(post.postId);
        }
      },
    );
  });

  describe('異常系', () => {
    it('存在しない投稿を取得しようとすると PostNotFoundError を返す', async () => {
      const deps = createDeps();
      const nonExistentPostId = crypto.randomUUID() as PostId;

      const useCase = GetPostUseCase.create(deps);
      const result = await useCase.run({ postId: nonExistentPostId });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err.type).toBe('PostNotFoundError');
        expect(result.err.detail.postId).toBe(nonExistentPostId);
      }
    });

    fcTest.prop([arbPostId()])(
      'プロパティ: 存在しないPostIDでは投稿を取得できない',
      async (postId) => {
        const deps = createDeps();

        const useCase = GetPostUseCase.create(deps);
        const result = await useCase.run({ postId });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.err.type).toBe('PostNotFoundError');
        }
      },
    );
  });

  describe('副作用の検証', () => {
    it('postResolver が正しく呼び出される', async () => {
      const deps = createDeps();
      const post: LocalPost = {
        type: 'local',
        postId: crypto.randomUUID() as PostId,
        actorId: crypto.randomUUID() as LocalPost['actorId'],
        content: 'Test',
        createdAt: Date.now() as LocalPost['createdAt'],
        userId: crypto.randomUUID() as LocalPost['userId'],
        inReplyToUri: null,
      };
      deps.postResolver.setPost(post);

      const useCase = GetPostUseCase.create(deps);
      await useCase.run({ postId: post.postId });

      expect(deps.postResolver.resolve).toHaveBeenCalledWith(post.postId);
    });

    it('postImagesResolver が正しく呼び出される', async () => {
      const deps = createDeps();
      const post: LocalPost = {
        type: 'local',
        postId: crypto.randomUUID() as PostId,
        actorId: crypto.randomUUID() as LocalPost['actorId'],
        content: 'Test',
        createdAt: Date.now() as LocalPost['createdAt'],
        userId: crypto.randomUUID() as LocalPost['userId'],
        inReplyToUri: null,
      };
      deps.postResolver.setPost(post);

      const useCase = GetPostUseCase.create(deps);
      await useCase.run({ postId: post.postId });

      expect(deps.postImagesResolver.resolve).toHaveBeenCalledWith(post.postId);
    });
  });
});
