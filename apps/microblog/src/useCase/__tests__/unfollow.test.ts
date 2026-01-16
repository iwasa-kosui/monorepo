import { test as fcTest } from '@fast-check/vitest';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { ActorId } from '../../domain/actor/actorId.ts';
import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { Follow } from '../../domain/follow/follow.ts';
import type { UserId } from '../../domain/user/userId.ts';
import { UnfollowUseCase } from '../unfollow.ts';
import { arbActorId, arbLocalActor, arbUserId } from './helper/arbitraries.ts';
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

    fcTest.prop([arbUserId(), arbActorId(), arbActorId()])(
      'プロパティ: 既存のフォロー関係があればフォロー解除できる',
      async (followerUserId, followerActorId, followingActorId) => {
        fc.pre(followerActorId !== followingActorId);

        const deps = createDeps();
        const followerActor: LocalActor = {
          id: followerActorId,
          userId: followerUserId,
          uri: 'https://example.com/users/follower',
          inboxUrl: 'https://example.com/inbox',
          type: 'local',
          logoUri: undefined,
        };
        setupFollowRelation(deps, followerActor, followingActorId);

        const useCase = UnfollowUseCase.create(deps);

        const result = await useCase.run({
          followerUserId,
          followingActorId,
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.val.followerId).toBe(followerActorId);
          expect(result.val.followingId).toBe(followingActorId);
        }
      },
    );
  });

  describe('異常系', () => {
    describe.each([
      { errorType: 'UserNotFoundError', description: 'フォロワーのアクターが存在しない場合' },
      { errorType: 'AlreadyUnfollowedError', description: '既にフォロー解除済みの場合' },
    ])('$description', ({ errorType }) => {
      if (errorType === 'UserNotFoundError') {
        it('UserNotFoundError を返す', async () => {
          const deps = createDeps();
          // アクターを登録しない

          const useCase = UnfollowUseCase.create(deps);

          const result = await useCase.run({
            followerUserId: crypto.randomUUID() as UserId,
            followingActorId: crypto.randomUUID() as ActorId,
          });

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.err.type).toBe('UserNotFoundError');
          }
        });

        fcTest.prop([arbUserId(), arbActorId()])(
          'プロパティ: 存在しないユーザーIDではフォロー解除できない',
          async (followerUserId, followingActorId) => {
            const deps = createDeps();
            // アクターを登録しない

            const useCase = UnfollowUseCase.create(deps);

            const result = await useCase.run({
              followerUserId,
              followingActorId,
            });

            expect(result.ok).toBe(false);
            if (!result.ok) {
              expect(result.err.type).toBe('UserNotFoundError');
            }
          },
        );
      }

      if (errorType === 'AlreadyUnfollowedError') {
        it('AlreadyUnfollowedError を返す', async () => {
          const deps = createDeps();
          const followerUserId = crypto.randomUUID() as UserId;
          const followerActor: LocalActor = {
            id: crypto.randomUUID() as ActorId,
            userId: followerUserId,
            uri: 'https://example.com/users/follower',
            inboxUrl: 'https://example.com/inbox',
            type: 'local',
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
        });

        it.each([
          { description: 'フォロー関係が元々ない場合' },
          { description: '以前フォロー解除した場合' },
        ])('$description、AlreadyUnfollowedError を返す', async () => {
          const deps = createDeps();
          const followerUserId = crypto.randomUUID() as UserId;
          const followerActor: LocalActor = {
            id: crypto.randomUUID() as ActorId,
            userId: followerUserId,
            uri: 'https://example.com/users/follower',
            inboxUrl: 'https://example.com/inbox',
            type: 'local',
            logoUri: undefined,
          };
          deps.actorResolverByUserId.setActor(followerActor);

          const useCase = UnfollowUseCase.create(deps);

          const result = await useCase.run({
            followerUserId,
            followingActorId: crypto.randomUUID() as ActorId,
          });

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.err.type).toBe('AlreadyUnfollowedError');
          }
        });

        fcTest.prop([arbUserId(), arbActorId(), arbActorId()])(
          'プロパティ: フォロー関係がなければフォロー解除できない',
          async (followerUserId, followerActorId, followingActorId) => {
            const deps = createDeps();
            const followerActor: LocalActor = {
              id: followerActorId,
              userId: followerUserId,
              uri: 'https://example.com/users/follower',
              inboxUrl: 'https://example.com/inbox',
              type: 'local',
              logoUri: undefined,
            };
            deps.actorResolverByUserId.setActor(followerActor);
            // フォロー関係を設定しない

            const useCase = UnfollowUseCase.create(deps);

            const result = await useCase.run({
              followerUserId,
              followingActorId,
            });

            expect(result.ok).toBe(false);
            if (!result.ok) {
              expect(result.err.type).toBe('AlreadyUnfollowedError');
            }
          },
        );
      }
    });
  });

  describe('副作用の検証', () => {
    it('フォロー解除成功時にイベントが保存される', async () => {
      const deps = createDeps();
      const followerUserId = crypto.randomUUID() as UserId;
      const followerActor: LocalActor = {
        id: crypto.randomUUID() as ActorId,
        userId: followerUserId,
        uri: 'https://example.com/users/follower',
        inboxUrl: 'https://example.com/inbox',
        type: 'local',
        logoUri: undefined,
      };
      const followingActorId = crypto.randomUUID() as ActorId;
      setupFollowRelation(deps, followerActor, followingActorId);

      const useCase = UnfollowUseCase.create(deps);

      await useCase.run({
        followerUserId,
        followingActorId,
      });

      expect(deps.unfollowedStore.store).toHaveBeenCalledTimes(1);
      expect(deps.unfollowedStore.items).toHaveLength(1);
    });

    it('フォロー解除失敗時はイベントが保存されない', async () => {
      const deps = createDeps();
      // アクターを登録しない

      const useCase = UnfollowUseCase.create(deps);

      await useCase.run({
        followerUserId: crypto.randomUUID() as UserId,
        followingActorId: crypto.randomUUID() as ActorId,
      });

      expect(deps.unfollowedStore.store).not.toHaveBeenCalled();
      expect(deps.unfollowedStore.items).toHaveLength(0);
    });
  });

  describe('冪等性の検証', () => {
    it('同じフォロー解除を2回実行すると2回目は失敗する', async () => {
      const deps = createDeps();
      const followerUserId = crypto.randomUUID() as UserId;
      const followerActor: LocalActor = {
        id: crypto.randomUUID() as ActorId,
        userId: followerUserId,
        uri: 'https://example.com/users/follower',
        inboxUrl: 'https://example.com/inbox',
        type: 'local',
        logoUri: undefined,
      };
      const followingActorId = crypto.randomUUID() as ActorId;
      setupFollowRelation(deps, followerActor, followingActorId);

      const useCase = UnfollowUseCase.create(deps);
      const input = { followerUserId, followingActorId };

      const firstResult = await useCase.run(input);
      expect(firstResult.ok).toBe(true);

      deps.followResolver.removeFollow(followerActor.id, followingActorId);

      const secondResult = await useCase.run(input);
      expect(secondResult.ok).toBe(false);
      if (!secondResult.ok) {
        expect(secondResult.err.type).toBe('AlreadyUnfollowedError');
      }
    });
  });
});
