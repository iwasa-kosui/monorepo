import { test as fcTest } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { RemoteActor } from '../../domain/actor/remoteActor.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { AcceptUnfollowUseCase } from '../acceptUnfollow.ts';
import { arbUsername } from './helper/arbitraries.ts';
import {
  createMockActorResolverByUri,
  createMockActorResolverByUserId,
  createMockFollowResolver,
  createMockUnfollowedStore,
  createMockUserResolverByUsername,
} from './helper/mockAdaptors.ts';

describe('AcceptUnfollowUseCase', () => {
  const createDeps = () => {
    const actorResolverByUri = createMockActorResolverByUri();
    const actorResolverByUserId = createMockActorResolverByUserId();
    const userResolverByUsername = createMockUserResolverByUsername();
    const unfollowedStore = createMockUnfollowedStore();
    const followResolver = createMockFollowResolver();
    return {
      actorResolverByUri,
      actorResolverByUserId,
      userResolverByUsername,
      unfollowedStore,
      followResolver,
    };
  };

  const setupLocalUser = (deps: ReturnType<typeof createDeps>, user: User, actor: LocalActor) => {
    deps.userResolverByUsername.setUser(user);
    deps.actorResolverByUserId.setActor({
      ...actor,
      userId: user.id,
    });
  };

  describe('正常系', () => {
    it('フォロー解除を受け入れできる', async () => {
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
      const remoteActor: RemoteActor = {
        id: crypto.randomUUID() as RemoteActor['id'],
        uri: 'https://remote.example.com/users/remote',
        inboxUrl: 'https://remote.example.com/inbox',
        type: 'remote',
        username: 'remote',
        url: 'https://remote.example.com/@remote',
        logoUri: undefined,
      };
      setupLocalUser(deps, user, actor);
      deps.actorResolverByUri.setActor(remoteActor);
      deps.followResolver.setFollow({
        followerId: remoteActor.id,
        followingId: actor.id,
      });

      const useCase = AcceptUnfollowUseCase.create(deps);

      const result = await useCase.run({
        username: user.username,
        follower: { uri: remoteActor.uri },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val?.followerId).toBe(remoteActor.id);
        expect(result.val?.followingId).toBe(actor.id);
        expect(deps.unfollowedStore.store).toHaveBeenCalledTimes(1);
      }
    });

    fcTest.prop([arbUsername()])(
      'プロパティ: 既存フォローの解除は成功する',
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
        const remoteActor: RemoteActor = {
          id: crypto.randomUUID() as RemoteActor['id'],
          uri: 'https://remote.example.com/users/remote',
          inboxUrl: 'https://remote.example.com/inbox',
          type: 'remote',
          username: 'remote',
          url: 'https://remote.example.com/@remote',
          logoUri: undefined,
        };
        setupLocalUser(deps, user, actor);
        deps.actorResolverByUri.setActor(remoteActor);
        deps.followResolver.setFollow({
          followerId: remoteActor.id,
          followingId: actor.id,
        });

        const useCase = AcceptUnfollowUseCase.create(deps);

        const result = await useCase.run({
          username,
          follower: { uri: remoteActor.uri },
        });

        expect(result.ok).toBe(true);
      },
    );
  });

  describe('異常系', () => {
    it('存在しないユーザーへのフォロー解除は UserNotFoundError を返す', async () => {
      const deps = createDeps();

      const useCase = AcceptUnfollowUseCase.create(deps);

      const result = await useCase.run({
        username: 'nonexistent' as Username,
        follower: { uri: 'https://remote.example.com/users/remote' },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err.type).toBe('UserNotFoundError');
      }
    });

    it('存在しないアクターからのフォロー解除は ActorNotFoundError を返す', async () => {
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
      setupLocalUser(deps, user, actor);

      const useCase = AcceptUnfollowUseCase.create(deps);

      const result = await useCase.run({
        username: user.username,
        follower: { uri: 'https://remote.example.com/users/unknown' },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err.type).toBe('ActorNotFoundError');
      }
    });

    it('フォローしていない場合 AlreadyUnfollowedError を返す', async () => {
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
      const remoteActor: RemoteActor = {
        id: crypto.randomUUID() as RemoteActor['id'],
        uri: 'https://remote.example.com/users/remote',
        inboxUrl: 'https://remote.example.com/inbox',
        type: 'remote',
        username: 'remote',
        url: 'https://remote.example.com/@remote',
        logoUri: undefined,
      };
      setupLocalUser(deps, user, actor);
      deps.actorResolverByUri.setActor(remoteActor);

      const useCase = AcceptUnfollowUseCase.create(deps);

      const result = await useCase.run({
        username: user.username,
        follower: { uri: remoteActor.uri },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err.type).toBe('AlreadyUnfollowedError');
      }
    });

    fcTest.prop([arbUsername()])(
      'プロパティ: 存在しないユーザーへのフォロー解除は失敗する',
      async (username) => {
        const deps = createDeps();

        const useCase = AcceptUnfollowUseCase.create(deps);

        const result = await useCase.run({
          username,
          follower: { uri: 'https://remote.example.com/users/remote' },
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.err.type).toBe('UserNotFoundError');
        }
      },
    );
  });

  describe('副作用の検証', () => {
    it('フォロー解除成功時に unfollowedStore が呼ばれる', async () => {
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
      const remoteActor: RemoteActor = {
        id: crypto.randomUUID() as RemoteActor['id'],
        uri: 'https://remote.example.com/users/remote',
        inboxUrl: 'https://remote.example.com/inbox',
        type: 'remote',
        username: 'remote',
        url: 'https://remote.example.com/@remote',
        logoUri: undefined,
      };
      setupLocalUser(deps, user, actor);
      deps.actorResolverByUri.setActor(remoteActor);
      deps.followResolver.setFollow({
        followerId: remoteActor.id,
        followingId: actor.id,
      });

      const useCase = AcceptUnfollowUseCase.create(deps);

      await useCase.run({
        username: user.username,
        follower: { uri: remoteActor.uri },
      });

      expect(deps.unfollowedStore.store).toHaveBeenCalledTimes(1);
    });

    it('失敗時は unfollowedStore が呼ばれない', async () => {
      const deps = createDeps();

      const useCase = AcceptUnfollowUseCase.create(deps);

      await useCase.run({
        username: 'nonexistent' as Username,
        follower: { uri: 'https://remote.example.com/users/remote' },
      });

      expect(deps.unfollowedStore.store).not.toHaveBeenCalled();
    });
  });

  describe('冪等性の検証', () => {
    it('同じフォロー解除を2回実行すると2回目は AlreadyUnfollowedError を返す', async () => {
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
      const remoteActor: RemoteActor = {
        id: crypto.randomUUID() as RemoteActor['id'],
        uri: 'https://remote.example.com/users/remote',
        inboxUrl: 'https://remote.example.com/inbox',
        type: 'remote',
        username: 'remote',
        url: 'https://remote.example.com/@remote',
        logoUri: undefined,
      };
      setupLocalUser(deps, user, actor);
      deps.actorResolverByUri.setActor(remoteActor);
      deps.followResolver.setFollow({
        followerId: remoteActor.id,
        followingId: actor.id,
      });

      const useCase = AcceptUnfollowUseCase.create(deps);

      const firstResult = await useCase.run({
        username: user.username,
        follower: { uri: remoteActor.uri },
      });
      expect(firstResult.ok).toBe(true);

      deps.followResolver.removeFollow(remoteActor.id, actor.id);

      const secondResult = await useCase.run({
        username: user.username,
        follower: { uri: remoteActor.uri },
      });

      expect(secondResult.ok).toBe(false);
      if (!secondResult.ok) {
        expect(secondResult.err.type).toBe('AlreadyUnfollowedError');
      }
    });
  });
});
