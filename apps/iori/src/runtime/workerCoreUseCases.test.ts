import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { ActorId } from '../domain/actor/actorId.ts';
import type { LocalActor } from '../domain/actor/localActor.ts';
import type { RemoteActor } from '../domain/actor/remoteActor.ts';
import type { Follow } from '../domain/follow/follow.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { Session, SessionWithUserAndActor } from '../domain/session/session.ts';
import { SessionId } from '../domain/session/sessionId.ts';
import type { User } from '../domain/user/user.ts';
import { UserId } from '../domain/user/userId.ts';
import type { Username } from '../domain/user/username.ts';
import { createWorkerGetRemoteActorPostsUseCase, createWorkerRemoteActorActions } from './workerCoreUseCases.ts';

describe('createWorkerRemoteActorActions', () => {
  it('stores and delivers follow and unfollow activities', async () => {
    const userId = UserId.generate();
    const sessionId = SessionId.generate();
    const follower: LocalActor = {
      id: ActorId.generate(),
      userId,
      uri: 'https://blog.test/users/kosui',
      inboxUrl: 'https://blog.test/users/kosui/inbox',
      type: 'local',
    };
    const following: RemoteActor = {
      id: ActorId.generate(),
      uri: 'https://remote.test/users/reader',
      inboxUrl: 'https://remote.test/users/reader/inbox',
      type: 'remote',
      username: 'reader',
    };
    const session: Session = { sessionId, userId, expires: Instant.addDuration(Instant.now(), 60_000) };
    const user: User = { id: userId, username: 'kosui' as Username };
    const follow: Follow = { followerId: follower.id, followingId: following.id };
    const followRequestedStore = { store: vi.fn(async () => RA.ok(undefined)) };
    const undoFollowingProcessedStore = { store: vi.fn(async () => RA.ok(undefined)) };
    const sendActivity = vi.fn(async () => undefined);
    const actions = createWorkerRemoteActorActions({
      sessionResolver: { resolve: vi.fn(async () => RA.ok(session)) },
      userResolver: { resolve: vi.fn(async () => RA.ok(user)) },
      actorResolverByUserId: { resolve: vi.fn(async () => RA.ok(follower)) },
      actorResolverById: { resolve: vi.fn(async () => RA.ok(following)) },
      followResolver: { resolve: vi.fn(async () => RA.ok(follow)) },
      followRequestedStore,
      undoFollowingProcessedStore,
    });
    const ctx = {
      getActorUri: vi.fn(() => new URL(follower.uri)),
      sendActivity,
    } as never;

    const followed = await actions.followRemoteActor({ sessionId, actorId: following.id, ctx });
    const unfollowed = await actions.unfollowRemoteActor({ sessionId, actorId: following.id, ctx });

    expect(followed.ok).toBe(true);
    expect(unfollowed.ok).toBe(true);
    expect(followRequestedStore.store).toHaveBeenCalledOnce();
    expect(undoFollowingProcessedStore.store).toHaveBeenCalledOnce();
    expect(sendActivity).toHaveBeenCalledTimes(2);
  });
});

describe('createWorkerGetRemoteActorPostsUseCase', () => {
  const userId = UserId.generate();
  const sessionId = SessionId.generate();
  const currentActor: LocalActor = {
    id: ActorId.generate(),
    userId,
    uri: 'https://blog.test/users/kosui',
    inboxUrl: 'https://blog.test/users/kosui/inbox',
    type: 'local',
  };
  const remoteActor: RemoteActor = {
    id: ActorId.generate(),
    uri: 'https://remote.test/users/reader',
    inboxUrl: 'https://remote.test/users/reader/inbox',
    type: 'remote',
    username: 'reader',
  };
  const user: User = { id: userId, username: 'kosui' as Username };
  const validSession: Session = { sessionId, userId, expires: Instant.addDuration(Instant.now(), 60_000) };

  const setup = (
    found: SessionWithUserAndActor | undefined,
    resolvedActor: LocalActor | RemoteActor | undefined = remoteActor,
  ) => {
    const sessionWithUserAndActorResolver = { resolve: vi.fn(async () => RA.ok(found)) };
    const actorResolverById = { resolve: vi.fn(async () => RA.ok(resolvedActor)) };
    const followResolver = { resolve: vi.fn(async () => RA.ok(undefined)) };
    const muteResolver = { resolve: vi.fn(async () => RA.ok(undefined)) };
    const postsResolverByActorIdWithPagination = { resolve: vi.fn(async () => RA.ok([])) };
    const useCase = createWorkerGetRemoteActorPostsUseCase({
      sessionResolver: { resolve: vi.fn(async () => RA.ok(undefined)) },
      userResolver: { resolve: vi.fn(async () => RA.ok(undefined)) },
      actorResolverByUserId: { resolve: vi.fn(async () => RA.ok(undefined)) },
      sessionWithUserAndActorResolver,
      actorResolverById,
      followResolver,
      muteResolver,
      postsResolverByActorIdWithPagination,
    });
    return { useCase, actorResolverById, followResolver, muteResolver, postsResolverByActorIdWithPagination };
  };
  const input = { sessionId, actorId: remoteActor.id, createdAt: undefined };

  it('returns SessionExpiredError when the session has expired', async () => {
    const { useCase, followResolver } = setup({
      session: { ...validSession, expires: Instant.addDuration(Instant.now(), -60_000) },
      user,
      actor: currentActor,
    });

    const result = await useCase.run(input);

    expect(!result.ok && result.err).toMatchObject({ type: 'SessionExpiredError' });
    expect(followResolver.resolve).not.toHaveBeenCalled();
  });

  it('returns UserNotFoundError when the user is missing', async () => {
    const { useCase } = setup({ session: validSession, user: undefined, actor: undefined });

    const result = await useCase.run(input);

    expect(!result.ok && result.err).toMatchObject({ type: 'UserNotFoundError' });
  });

  it('returns UserNotFoundError when the local actor is missing', async () => {
    const { useCase } = setup({ session: validSession, user, actor: undefined });

    const result = await useCase.run(input);

    expect(!result.ok && result.err).toMatchObject({ type: 'UserNotFoundError' });
  });

  it('returns Remote actor not found when the actor is not remote', async () => {
    const { useCase, postsResolverByActorIdWithPagination } = setup(
      { session: validSession, user, actor: currentActor },
      currentActor,
    );

    const result = await useCase.run(input);

    expect(!result.ok && result.err).toEqual({ message: `Remote actor not found: ${remoteActor.id}` });
    expect(postsResolverByActorIdWithPagination.resolve).not.toHaveBeenCalled();
  });

  it('resolves the remote actor profile with follow, mute, and posts', async () => {
    const { useCase, actorResolverById } = setup({ session: validSession, user, actor: currentActor });

    const result = await useCase.run(input);

    expect(result.ok && result.val).toEqual({
      remoteActor,
      isFollowing: false,
      isMuted: false,
      posts: [],
    });
    expect(actorResolverById.resolve).toHaveBeenCalledWith(remoteActor.id);
  });
});
