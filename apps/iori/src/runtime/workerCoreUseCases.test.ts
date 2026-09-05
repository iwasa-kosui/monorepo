import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { ActorId } from '../domain/actor/actorId.ts';
import type { LocalActor } from '../domain/actor/localActor.ts';
import type { RemoteActor } from '../domain/actor/remoteActor.ts';
import type { Follow } from '../domain/follow/follow.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { Session } from '../domain/session/session.ts';
import { SessionId } from '../domain/session/sessionId.ts';
import type { User } from '../domain/user/user.ts';
import { UserId } from '../domain/user/userId.ts';
import type { Username } from '../domain/user/username.ts';
import { createWorkerRemoteActorActions } from './workerCoreUseCases.ts';

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
