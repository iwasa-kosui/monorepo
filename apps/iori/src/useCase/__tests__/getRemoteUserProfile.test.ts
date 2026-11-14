import { describe, expect, it } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { RemoteActor } from '../../domain/actor/remoteActor.ts';
import { GetRemoteUserProfileUseCase } from '../getRemoteUserProfile.ts';
import { createMockActorResolverById, createMockFollowResolver } from './helper/mockAdaptors.ts';

describe('GetRemoteUserProfileUseCase', () => {
  const createDeps = () => {
    const actorResolverById = createMockActorResolverById();
    const followResolver = createMockFollowResolver();
    return {
      actorResolverById,
      followResolver,
    };
  };

  describe('正常系', () => {
    it('フォロー中のリモートユーザーの場合 isFollowing が true', async () => {
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

      const useCase = GetRemoteUserProfileUseCase.create(deps);

      const result = await useCase.run({
        actorId: remoteActor.id,
        currentUserActorId: currentUserActor.id,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.isFollowing).toBe(true);
      }
    });

    it('フォローしていないリモートユーザーの場合 isFollowing が false', async () => {
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

      const useCase = GetRemoteUserProfileUseCase.create(deps);

      const result = await useCase.run({
        actorId: remoteActor.id,
        currentUserActorId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.isFollowing).toBe(false);
      }
    });
  });

  describe('異常系', () => {
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

      const useCase = GetRemoteUserProfileUseCase.create(deps);

      const result = await useCase.run({
        actorId: localActor.id,
        currentUserActorId: undefined,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err.type).toBe('NotRemoteActorError');
      }
    });
  });
});
