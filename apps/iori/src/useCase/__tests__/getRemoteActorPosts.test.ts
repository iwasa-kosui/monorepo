import { describe, expect, it } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { RemoteActor } from '../../domain/actor/remoteActor.ts';
import { GetRemoteActorPostsUseCase } from '../getRemoteActorPosts.ts';
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
  });
});
