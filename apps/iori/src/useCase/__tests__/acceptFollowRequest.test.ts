import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { BlockResolver } from '../../domain/block/block.ts';
import type { User } from '../../domain/user/user.ts';
import { Username } from '../../domain/user/username.ts';
import { AcceptFollowRequestUseCase } from '../acceptFollowRequest.ts';
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
        username: Username.orThrow('kosui'),
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

  describe('異常系', () => {
    it('存在しないユーザーへのフォローは UserNotFoundError を返し、フォローを保存しない', async () => {
      const deps = createDeps();

      const result = await AcceptFollowRequestUseCase.create(deps).run({
        username: 'nonexistent' as Username,
        follower: {
          uri: 'https://remote.example.com/users/remote',
          inboxUrl: 'https://remote.example.com/inbox',
          url: 'https://remote.example.com/@remote',
          username: 'remote',
        },
      });

      expect(result).toMatchObject({ ok: false, err: { type: 'UserNotFoundError' } });
      expect(deps.followedStore.store).not.toHaveBeenCalled();
    });
  });
});
