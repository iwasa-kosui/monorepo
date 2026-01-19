import { test as fcTest } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { PostWithAuthor } from '../../domain/post/post.ts';
import type { PostId } from '../../domain/post/postId.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { GetUserProfileUseCase } from '../getUserProfile.ts';
import { arbUsername } from './helper/arbitraries.ts';
import {
  createMockActorResolverByUserId,
  createMockActorsResolverByFollowerId,
  createMockActorsResolverByFollowingId,
  createMockPostsResolverByActorIds,
  createMockUserResolverByUsername,
} from './helper/mockAdaptors.ts';

describe('GetUserProfileUseCase', () => {
  const createDeps = () => {
    const userResolverByUsername = createMockUserResolverByUsername();
    const actorResolverByUserId = createMockActorResolverByUserId();
    const actorsResolverByFollowerId = createMockActorsResolverByFollowerId();
    const actorsResolverByFollowingId = createMockActorsResolverByFollowingId();
    const postsResolverByActorIds = createMockPostsResolverByActorIds();
    return {
      userResolverByUsername,
      actorResolverByUserId,
      actorsResolverByFollowerId,
      actorsResolverByFollowingId,
      postsResolverByActorIds,
    };
  };

  const setupUser = (deps: ReturnType<typeof createDeps>, user: User, actor: LocalActor) => {
    deps.userResolverByUsername.setUser(user);
    deps.actorResolverByUserId.setActor({
      ...actor,
      userId: user.id,
    });
  };

  describe('正常系', () => {
    it('ユーザープロフィールを取得できる', async () => {
      const deps = createDeps();
      const user: User = {
        id: crypto.randomUUID() as User['id'],
        username: 'kosui' as Username,
      };
      const actor: LocalActor = {
        id: crypto.randomUUID() as LocalActor['id'],
        userId: user.id,
        uri: 'https://example.com/users/kosui',
        inboxUrl: 'https://example.com/inbox',
        type: 'local',
        logoUri: undefined,
      };
      setupUser(deps, user, actor);

      const useCase = GetUserProfileUseCase.create(deps);

      const result = await useCase.run({ username: user.username });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.user.username).toBe('kosui');
        expect(result.val.actor.id).toBe(actor.id);
        expect(result.val.posts).toEqual([]);
        expect(result.val.following).toEqual([]);
        expect(result.val.followers).toEqual([]);
      }
    });

    it('投稿を含むプロフィールを取得できる', async () => {
      const deps = createDeps();
      const user: User = {
        id: crypto.randomUUID() as User['id'],
        username: 'kosui' as Username,
      };
      const actor: LocalActor = {
        id: crypto.randomUUID() as LocalActor['id'],
        userId: user.id,
        uri: 'https://example.com/users/kosui',
        inboxUrl: 'https://example.com/inbox',
        type: 'local',
        logoUri: undefined,
      };
      setupUser(deps, user, actor);

      const posts: PostWithAuthor[] = [
        {
          type: 'local',
          postId: crypto.randomUUID() as PostId,
          actorId: actor.id,
          content: 'Hello from profile!',
          createdAt: Date.now() as PostWithAuthor['createdAt'],
          userId: user.id,
          username: user.username,
          logoUri: undefined,
          liked: false,
          images: [],
          inReplyToUri: null,
        },
      ];
      deps.postsResolverByActorIds.setPosts(posts);

      const useCase = GetUserProfileUseCase.create(deps);

      const result = await useCase.run({ username: user.username });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.posts).toHaveLength(1);
        expect(result.val.posts[0].content).toBe('Hello from profile!');
      }
    });

    it('フォロー/フォロワー情報を取得できる', async () => {
      const deps = createDeps();
      const user: User = {
        id: crypto.randomUUID() as User['id'],
        username: 'kosui' as Username,
      };
      const actor: LocalActor = {
        id: crypto.randomUUID() as LocalActor['id'],
        userId: user.id,
        uri: 'https://example.com/users/kosui',
        inboxUrl: 'https://example.com/inbox',
        type: 'local',
        logoUri: undefined,
      };
      const followingActor: LocalActor = {
        id: crypto.randomUUID() as LocalActor['id'],
        userId: crypto.randomUUID() as User['id'],
        uri: 'https://example.com/users/following',
        inboxUrl: 'https://example.com/inbox',
        type: 'local',
        logoUri: undefined,
      };
      const followerActor: LocalActor = {
        id: crypto.randomUUID() as LocalActor['id'],
        userId: crypto.randomUUID() as User['id'],
        uri: 'https://example.com/users/follower',
        inboxUrl: 'https://example.com/inbox',
        type: 'local',
        logoUri: undefined,
      };
      setupUser(deps, user, actor);
      deps.actorsResolverByFollowerId.setActors(actor.id, [followingActor]);
      deps.actorsResolverByFollowingId.setActors(actor.id, [followerActor]);

      const useCase = GetUserProfileUseCase.create(deps);

      const result = await useCase.run({ username: user.username });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.following).toHaveLength(1);
        expect(result.val.followers).toHaveLength(1);
      }
    });

    fcTest.prop([arbUsername()])(
      'プロパティ: 登録済みのユーザー名でプロフィールを取得できる',
      async (username) => {
        const deps = createDeps();
        const user: User = {
          id: crypto.randomUUID() as User['id'],
          username,
        };
        const actor: LocalActor = {
          id: crypto.randomUUID() as LocalActor['id'],
          userId: user.id,
          uri: `https://example.com/users/${username}`,
          inboxUrl: 'https://example.com/inbox',
          type: 'local',
          logoUri: undefined,
        };
        setupUser(deps, user, actor);

        const useCase = GetUserProfileUseCase.create(deps);

        const result = await useCase.run({ username });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.val.user.username).toBe(username);
        }
      },
    );
  });

  describe('異常系', () => {
    it('存在しないユーザー名の場合 UserNotFoundError を返す', async () => {
      const deps = createDeps();

      const useCase = GetUserProfileUseCase.create(deps);

      const result = await useCase.run({ username: 'nonexistent' as Username });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err.type).toBe('UserNotFoundError');
      }
    });

    fcTest.prop([arbUsername()])(
      'プロパティ: 存在しないユーザー名ではプロフィールを取得できない',
      async (username) => {
        const deps = createDeps();

        const useCase = GetUserProfileUseCase.create(deps);

        const result = await useCase.run({ username });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.err.type).toBe('UserNotFoundError');
        }
      },
    );
  });

  describe('副作用の検証', () => {
    it('各 resolver が正しく呼び出される', async () => {
      const deps = createDeps();
      const user: User = {
        id: crypto.randomUUID() as User['id'],
        username: 'kosui' as Username,
      };
      const actor: LocalActor = {
        id: crypto.randomUUID() as LocalActor['id'],
        userId: user.id,
        uri: 'https://example.com/users/kosui',
        inboxUrl: 'https://example.com/inbox',
        type: 'local',
        logoUri: undefined,
      };
      setupUser(deps, user, actor);

      const useCase = GetUserProfileUseCase.create(deps);

      await useCase.run({ username: user.username });

      expect(deps.userResolverByUsername.resolve).toHaveBeenCalledWith(user.username);
      expect(deps.actorResolverByUserId.resolve).toHaveBeenCalledWith(user.id);
      expect(deps.actorsResolverByFollowerId.resolve).toHaveBeenCalledWith(actor.id);
      expect(deps.actorsResolverByFollowingId.resolve).toHaveBeenCalledWith(actor.id);
      expect(deps.postsResolverByActorIds.resolve).toHaveBeenCalled();
    });
  });
});
