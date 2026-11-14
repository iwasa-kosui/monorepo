import { describe, expect, it } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { RemoteActor } from '../../domain/actor/remoteActor.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { AcceptUnfollowUseCase } from '../acceptUnfollow.ts';
import {
  createMockActorResolverByUri,
  createMockActorResolverByUserId,
  createMockFollowResolver,
  createMockUnfollowedStore,
  createMockUserResolverByUsername,
} from './helper/mockAdaptors.ts';

describe('AcceptUnfollowUseCase', () => {
  const setup = () => {
    const deps = {
      actorResolverByUri: createMockActorResolverByUri(),
      actorResolverByUserId: createMockActorResolverByUserId(),
      userResolverByUsername: createMockUserResolverByUsername(),
      unfollowedStore: createMockUnfollowedStore(),
      followResolver: createMockFollowResolver(),
    };
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
    deps.userResolverByUsername.setUser(user);
    deps.actorResolverByUserId.setActor(actor);
    return { deps, user, actor, remoteActor, useCase: AcceptUnfollowUseCase.create(deps) };
  };

  it('既存のフォローを解除し、解除イベントを保存する', async () => {
    const { deps, user, actor, remoteActor, useCase } = setup();
    deps.actorResolverByUri.setActor(remoteActor);
    deps.followResolver.setFollow({ followerId: remoteActor.id, followingId: actor.id });

    const result = await useCase.run({ username: user.username, follower: { uri: remoteActor.uri } });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.val?.followerId).toBe(remoteActor.id);
      expect(result.val?.followingId).toBe(actor.id);
    }
    expect(deps.unfollowedStore.store).toHaveBeenCalledTimes(1);
  });

  it('存在しないユーザーへのフォロー解除は UserNotFoundError を返し、何も保存しない', async () => {
    const { deps, useCase } = setup();

    const result = await useCase.run({
      username: 'nonexistent' as Username,
      follower: { uri: 'https://remote.example.com/users/remote' },
    });

    expect(result).toMatchObject({ ok: false, err: { type: 'UserNotFoundError' } });
    expect(deps.unfollowedStore.store).not.toHaveBeenCalled();
  });

  it('存在しないアクターからのフォロー解除は ActorNotFoundError を返す', async () => {
    const { user, useCase } = setup();

    const result = await useCase.run({
      username: user.username,
      follower: { uri: 'https://remote.example.com/users/unknown' },
    });

    expect(result).toMatchObject({ ok: false, err: { type: 'ActorNotFoundError' } });
  });

  it('フォローしていない場合 AlreadyUnfollowedError を返し、何も保存しない', async () => {
    const { deps, user, remoteActor, useCase } = setup();
    deps.actorResolverByUri.setActor(remoteActor);

    const result = await useCase.run({ username: user.username, follower: { uri: remoteActor.uri } });

    expect(result).toMatchObject({ ok: false, err: { type: 'AlreadyUnfollowedError' } });
    expect(deps.unfollowedStore.store).not.toHaveBeenCalled();
  });
});
