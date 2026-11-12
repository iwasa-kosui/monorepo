import { test as fcTest } from '@fast-check/vitest';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { BlockResolver } from '../../domain/block/block.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { AcceptFollowRequestUseCase } from '../acceptFollowRequest.ts';
import { arbUsername } from './helper/arbitraries.ts';
import {
  createMockActorResolverByUri,
  createMockActorResolverByUserId,
  createMockFollowAcceptedStore,
  createMockFollowNotificationCreatedStore,
  createMockFollowResolver,
  createMockLogoUriUpdatedStore,
  createMockPushSubscriptionsResolverByUserId,
  createMockRemoteActorCreatedStore,
  createMockUserResolverByUsername,
  createMockWebPushSender,
} from './helper/mockAdaptors.ts';

describe('AcceptFollowRequestUseCase', () => {
  const createDeps = () => {
    const actorResolverByUri = createMockActorResolverByUri();
    const actorResolverByUserId = createMockActorResolverByUserId();
    const userResolverByUsername = createMockUserResolverByUsername();
    const remoteActorCreatedStore = createMockRemoteActorCreatedStore();
    const logoUriUpdatedStore = createMockLogoUriUpdatedStore();
    const followedStore = createMockFollowAcceptedStore();
    const followResolver = createMockFollowResolver();
    const followNotificationCreatedStore = createMockFollowNotificationCreatedStore();
    const pushSubscriptionsResolver = createMockPushSubscriptionsResolverByUserId();
    const webPushSender = createMockWebPushSender();
    return {
      actorResolverByUri,
      actorResolverByUserId,
      userResolverByUsername,
      remoteActorCreatedStore,
      logoUriUpdatedStore,
      followedStore,
      followResolver,
      followNotificationCreatedStore,
      pushSubscriptionsResolver,
      webPushSender,
    };
  };

  const setupLocalUser = (deps: ReturnType<typeof createDeps>, user: User, actor: LocalActor) => {
    deps.userResolverByUsername.setUser(user);
    deps.actorResolverByUserId.setActor({
      ...actor,
      userId: user.id,
    });
  };

  describe('ブロックしている相手', () => {
    const run = async (blockResolver: BlockResolver) => {
      const deps = {
        ...createDeps(),
        pushSubscriptionsResolver: {
          resolve: vi.fn(() => RA.ok([{ endpoint: 'https://push.example.com/1' }] as never)),
        },
        blockResolver,
      };
      const user: User = { id: crypto.randomUUID() as User['id'], username: 'kosui' as Username };
      setupLocalUser(deps as never, user, {
        id: crypto.randomUUID() as LocalActor['id'],
        userId: user.id,
        uri: 'https://example.com/users/kosui',
        inboxUrl: 'https://example.com/inbox',
        type: 'local',
        logoUri: undefined,
      });
      const result = await AcceptFollowRequestUseCase.create(deps as never).run({
        username: user.username,
        follower: {
          uri: 'https://remote.example.com/users/remote',
          inboxUrl: 'https://remote.example.com/inbox',
          url: 'https://remote.example.com/@remote',
          username: 'remote',
        },
      });
      return { deps, result };
    };

    it('フォローは受け入れるが、通知も Web Push も作らない', async () => {
      const { deps, result } = await run({ resolve: vi.fn(() => RA.ok({} as never)) });

      expect(result.ok).toBe(true);
      expect(deps.followedStore.store).toHaveBeenCalledTimes(1);
      expect(deps.followNotificationCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.webPushSender.send).not.toHaveBeenCalled();
    });

    it('ブロックしていない相手なら、これまでどおり通知と Web Push を作る', async () => {
      const { deps, result } = await run({ resolve: vi.fn(() => RA.ok(undefined)) });

      expect(result.ok).toBe(true);
      expect(deps.followNotificationCreatedStore.store).toHaveBeenCalledTimes(1);
      expect(deps.webPushSender.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('正常系', () => {
    it('フォローリクエストを受け入れできる', async () => {
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

      const follower = {
        uri: 'https://remote.example.com/users/remote',
        inboxUrl: 'https://remote.example.com/inbox',
        url: 'https://remote.example.com/@remote',
        username: 'remote',
      };

      const useCase = AcceptFollowRequestUseCase.create(deps);

      const result = await useCase.run({
        username: user.username,
        follower,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.followingId).toBe(actor.id);
        expect(deps.followedStore.store).toHaveBeenCalledTimes(1);
      }
    });

    it('フォロー受け入れ後のフォロー関係が正しい', async () => {
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

      const follower = {
        uri: 'https://remote.example.com/users/remote2',
        inboxUrl: 'https://remote.example.com/inbox',
        url: 'https://remote.example.com/@remote2',
        username: 'remote2',
      };

      const useCase = AcceptFollowRequestUseCase.create(deps);

      const result = await useCase.run({
        username: user.username,
        follower,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.followingId).toBe(actor.id);
        expect(deps.followedStore.store).toHaveBeenCalledTimes(1);
      }
    });

    fcTest.prop([arbUsername()])(
      'プロパティ: 存在するユーザーへのフォローリクエストは受け入れできる',
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
        setupLocalUser(deps, user, actor);

        const follower = {
          uri: 'https://remote.example.com/users/remote',
          inboxUrl: 'https://remote.example.com/inbox',
          url: 'https://remote.example.com/@remote',
          username: 'remote',
        };

        const useCase = AcceptFollowRequestUseCase.create(deps);

        const result = await useCase.run({
          username,
          follower,
        });

        expect(result.ok).toBe(true);
      },
    );
  });

  describe('異常系', () => {
    it('存在しないユーザーへのフォローは UserNotFoundError を返す', async () => {
      const deps = createDeps();

      const follower = {
        uri: 'https://remote.example.com/users/remote',
        inboxUrl: 'https://remote.example.com/inbox',
        url: 'https://remote.example.com/@remote',
        username: 'remote',
      };

      const useCase = AcceptFollowRequestUseCase.create(deps);

      const result = await useCase.run({
        username: 'nonexistent' as Username,
        follower,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err.type).toBe('UserNotFoundError');
      }
    });

    fcTest.prop([arbUsername()])(
      'プロパティ: 存在しないユーザーへのフォローリクエストは失敗する',
      async (username) => {
        const deps = createDeps();

        const follower = {
          uri: 'https://remote.example.com/users/remote',
          inboxUrl: 'https://remote.example.com/inbox',
          url: 'https://remote.example.com/@remote',
          username: 'remote',
        };

        const useCase = AcceptFollowRequestUseCase.create(deps);

        const result = await useCase.run({
          username,
          follower,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.err.type).toBe('UserNotFoundError');
        }
      },
    );
  });

  describe('副作用の検証', () => {
    it('新規フォロー時に followedStore が呼ばれる', async () => {
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

      const follower = {
        uri: 'https://remote.example.com/users/remote',
        inboxUrl: 'https://remote.example.com/inbox',
        url: 'https://remote.example.com/@remote',
        username: 'remote',
      };

      const useCase = AcceptFollowRequestUseCase.create(deps);

      await useCase.run({
        username: user.username,
        follower,
      });

      expect(deps.followedStore.store).toHaveBeenCalledTimes(1);
    });

    it('失敗時は followedStore が呼ばれない', async () => {
      const deps = createDeps();

      const follower = {
        uri: 'https://remote.example.com/users/remote',
        inboxUrl: 'https://remote.example.com/inbox',
        url: 'https://remote.example.com/@remote',
        username: 'remote',
      };

      const useCase = AcceptFollowRequestUseCase.create(deps);

      await useCase.run({
        username: 'nonexistent' as Username,
        follower,
      });

      expect(deps.followedStore.store).not.toHaveBeenCalled();
    });
  });
});
