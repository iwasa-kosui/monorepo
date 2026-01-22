import { test as fcTest } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { RemoteActor } from '../../domain/actor/remoteActor.ts';
import type { PostQuery } from '../../domain/post/post.ts';
import type { PostId } from '../../domain/post/postId.ts';
import type { Username } from '../../domain/user/username.ts';
import { GetRemoteActorPostsUseCase } from '../getRemoteActorPosts.ts';
import { arbActorId, arbRemoteActor } from './helper/arbitraries.ts';
import {
  createMockActorResolverById,
  createMockFollowResolver,
  createMockMuteResolver,
  createMockPostsResolverByActorIdWithPagination,
} from './helper/mockAdaptors.ts';

describe('GetRemoteActorPostsUseCase', () => {
  const createDeps = () => {
    const actorResolverById = createMockActorResolverById();
    const followResolver = createMockFollowResolver();
    const muteResolver = createMockMuteResolver();
    const postsResolverByActorIdWithPagination = createMockPostsResolverByActorIdWithPagination();
    return {
      actorResolverById,
      followResolver,
      muteResolver,
      postsResolverByActorIdWithPagination,
    };
  };

  describe('正常系', () => {
    it('リモートアクターの投稿を取得できる', async () => {
      const deps = createDeps();
      const remoteActor: RemoteActor = {
        id: crypto.randomUUID() as RemoteActor['id'],
        uri: 'https://remote.example.com/users/remote',
        inboxUrl: 'https://remote.example.com/inbox',
        type: 'remote',
        username: 'remote',
        url: 'https://remote.example.com/@remote',
        logoUri: undefined,
      };
      deps.actorResolverById.setActor(remoteActor);

      const useCase = GetRemoteActorPostsUseCase.create(deps);

      const result = await useCase.run({
        actorId: remoteActor.id,
        currentUserActorId: undefined,
        createdAt: undefined,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.remoteActor.id).toBe(remoteActor.id);
        expect(result.val.isFollowing).toBe(false);
        expect(result.val.posts).toEqual([]);
      }
    });

    it('投稿を含むリモートアクターの情報を取得できる', async () => {
      const deps = createDeps();
      const remoteActor: RemoteActor = {
        id: crypto.randomUUID() as RemoteActor['id'],
        uri: 'https://remote.example.com/users/remote',
        inboxUrl: 'https://remote.example.com/inbox',
        type: 'remote',
        username: 'remote',
        url: 'https://remote.example.com/@remote',
        logoUri: undefined,
      };
      deps.actorResolverById.setActor(remoteActor);

      const posts: PostQuery[] = [
        {
          type: 'remote',
          postId: crypto.randomUUID() as PostId,
          actorId: remoteActor.id,
          content: 'Remote post content',
          createdAt: Date.now() as PostQuery['createdAt'],
          uri: 'https://remote.example.com/posts/1',
          inReplyToUri: null,
          username: 'remote' as Username,
          logoUri: undefined,
          liked: false,
          reposted: false,
          images: [],
          likeCount: 0,
          repostCount: 0,
          reactionCounts: [],
        },
      ];
      deps.postsResolverByActorIdWithPagination.setPosts(posts);

      const useCase = GetRemoteActorPostsUseCase.create(deps);

      const result = await useCase.run({
        actorId: remoteActor.id,
        currentUserActorId: undefined,
        createdAt: undefined,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.posts).toHaveLength(1);
        expect(result.val.posts[0].content).toBe('Remote post content');
      }
    });

    it('フォロー中のリモートアクターの場合 isFollowing が true', async () => {
      const deps = createDeps();
      const remoteActor: RemoteActor = {
        id: crypto.randomUUID() as RemoteActor['id'],
        uri: 'https://remote.example.com/users/remote',
        inboxUrl: 'https://remote.example.com/inbox',
        type: 'remote',
        username: 'remote',
        url: 'https://remote.example.com/@remote',
        logoUri: undefined,
      };
      const currentUserActor: LocalActor = {
        id: crypto.randomUUID() as LocalActor['id'],
        userId: crypto.randomUUID() as LocalActor['userId'],
        uri: 'https://example.com/users/current',
        inboxUrl: 'https://example.com/inbox',
        type: 'local',
        logoUri: undefined,
      };
      deps.actorResolverById.setActor(remoteActor);
      deps.followResolver.setFollow({
        followerId: currentUserActor.id,
        followingId: remoteActor.id,
      });

      const useCase = GetRemoteActorPostsUseCase.create(deps);

      const result = await useCase.run({
        actorId: remoteActor.id,
        currentUserActorId: currentUserActor.id,
        createdAt: undefined,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.isFollowing).toBe(true);
      }
    });

    fcTest.prop([arbRemoteActor()])(
      'プロパティ: 登録済みリモートアクターの投稿は取得できる',
      async (remoteActor) => {
        const deps = createDeps();
        deps.actorResolverById.setActor(remoteActor);

        const useCase = GetRemoteActorPostsUseCase.create(deps);

        const result = await useCase.run({
          actorId: remoteActor.id,
          currentUserActorId: undefined,
          createdAt: undefined,
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.val.remoteActor.id).toBe(remoteActor.id);
        }
      },
    );
  });

  describe('異常系', () => {
    it('存在しないアクターの場合 RemoteActorNotFoundError を返す', async () => {
      const deps = createDeps();
      const nonExistentActorId = crypto.randomUUID() as RemoteActor['id'];

      const useCase = GetRemoteActorPostsUseCase.create(deps);

      const result = await useCase.run({
        actorId: nonExistentActorId,
        currentUserActorId: undefined,
        createdAt: undefined,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err.type).toBe('RemoteActorNotFoundError');
      }
    });

    it('ローカルアクターの場合 NotRemoteActorError を返す', async () => {
      const deps = createDeps();
      const localActor: LocalActor = {
        id: crypto.randomUUID() as LocalActor['id'],
        userId: crypto.randomUUID() as LocalActor['userId'],
        uri: 'https://example.com/users/local',
        inboxUrl: 'https://example.com/inbox',
        type: 'local',
        logoUri: undefined,
      };
      deps.actorResolverById.setActor(localActor);

      const useCase = GetRemoteActorPostsUseCase.create(deps);

      const result = await useCase.run({
        actorId: localActor.id,
        currentUserActorId: undefined,
        createdAt: undefined,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err.type).toBe('NotRemoteActorError');
      }
    });

    fcTest.prop([arbActorId()])(
      'プロパティ: 存在しないアクターIDでは投稿を取得できない',
      async (actorId) => {
        const deps = createDeps();

        const useCase = GetRemoteActorPostsUseCase.create(deps);

        const result = await useCase.run({
          actorId,
          currentUserActorId: undefined,
          createdAt: undefined,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.err.type).toBe('RemoteActorNotFoundError');
        }
      },
    );
  });

  describe('副作用の検証', () => {
    it('actorResolverById が正しく呼び出される', async () => {
      const deps = createDeps();
      const remoteActor: RemoteActor = {
        id: crypto.randomUUID() as RemoteActor['id'],
        uri: 'https://remote.example.com/users/remote',
        inboxUrl: 'https://remote.example.com/inbox',
        type: 'remote',
        username: 'remote',
        url: 'https://remote.example.com/@remote',
        logoUri: undefined,
      };
      deps.actorResolverById.setActor(remoteActor);

      const useCase = GetRemoteActorPostsUseCase.create(deps);

      await useCase.run({
        actorId: remoteActor.id,
        currentUserActorId: undefined,
        createdAt: undefined,
      });

      expect(deps.actorResolverById.resolve).toHaveBeenCalledWith(remoteActor.id);
    });

    it('currentUserActorId が指定された場合 followResolver が呼び出される', async () => {
      const deps = createDeps();
      const remoteActor: RemoteActor = {
        id: crypto.randomUUID() as RemoteActor['id'],
        uri: 'https://remote.example.com/users/remote',
        inboxUrl: 'https://remote.example.com/inbox',
        type: 'remote',
        username: 'remote',
        url: 'https://remote.example.com/@remote',
        logoUri: undefined,
      };
      const currentUserActorId = crypto.randomUUID() as LocalActor['id'];
      deps.actorResolverById.setActor(remoteActor);

      const useCase = GetRemoteActorPostsUseCase.create(deps);

      await useCase.run({
        actorId: remoteActor.id,
        currentUserActorId,
        createdAt: undefined,
      });

      expect(deps.followResolver.resolve).toHaveBeenCalled();
    });
  });
});
