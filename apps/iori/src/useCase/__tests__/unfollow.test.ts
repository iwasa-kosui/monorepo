import { describe, expect, it } from 'vitest';

import type { ActorId } from '../../domain/actor/actorId.ts';
import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { Follow } from '../../domain/follow/follow.ts';
import type { UserId } from '../../domain/user/userId.ts';
import { Username } from '../../domain/user/username.ts';
import { UnfollowUseCase } from '../unfollow.ts';
import {
  createMockActorResolverByUserId,
  createMockFollowResolver,
  createMockUnfollowedStore,
} from './helper/mockAdaptors.ts';

describe('UnfollowUseCase', () => {
  const createDeps = () => {
    const actorResolverByUserId = createMockActorResolverByUserId();
    const unfollowedStore = createMockUnfollowedStore();
    const followResolver = createMockFollowResolver();
    return {
      actorResolverByUserId,
      unfollowedStore,
      followResolver,
    };
  };

  const setupFollowRelation = (
    deps: ReturnType<typeof createDeps>,
    followerActor: LocalActor,
    followingActorId: ActorId,
  ) => {
    deps.actorResolverByUserId.setActor(followerActor);
    const follow: Follow = {
      followerId: followerActor.id,
      followingId: followingActorId,
    };
    deps.followResolver.setFollow(follow);
    return follow;
  };

  describe('正常系', () => {
    it('フォロー解除が成功する', async () => {
      const deps = createDeps();
      const followerUserId = crypto.randomUUID() as UserId;
      const followerActor: LocalActor = {
        id: crypto.randomUUID() as ActorId,
        userId: followerUserId,
        uri: 'https://example.com/users/follower',
        inboxUrl: 'https://example.com/inbox',
        type: 'local',
        username: Username.orThrow('follower'),
        logoUri: undefined,
      };
      const followingActorId = crypto.randomUUID() as ActorId;
      setupFollowRelation(deps, followerActor, followingActorId);

      const useCase = UnfollowUseCase.create(deps);

      const result = await useCase.run({
        followerUserId,
        followingActorId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.followerId).toBe(followerActor.id);
        expect(result.val.followingId).toBe(followingActorId);
        expect(deps.unfollowedStore.store).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('異常系', () => {
    it('既にフォロー解除済みの場合 AlreadyUnfollowedError を返し、イベントを保存しない', async () => {
      const deps = createDeps();
      const followerUserId = crypto.randomUUID() as UserId;
      const followerActor: LocalActor = {
        id: crypto.randomUUID() as ActorId,
        userId: followerUserId,
        uri: 'https://example.com/users/follower',
        inboxUrl: 'https://example.com/inbox',
        type: 'local',
        username: Username.orThrow('follower'),
        logoUri: undefined,
      };
      deps.actorResolverByUserId.setActor(followerActor);
      // フォロー関係を設定しない

      const useCase = UnfollowUseCase.create(deps);

      const result = await useCase.run({
        followerUserId,
        followingActorId: crypto.randomUUID() as ActorId,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err.type).toBe('AlreadyUnfollowedError');
      }
      expect(deps.unfollowedStore.items).toHaveLength(0);
    });
  });
});
