import { Follow as ActivityPubFollow, Undo } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';

import type { ActorResolverById } from '../adaptor/d1/actor/actorResolverById.ts';
import type {
  ActorResolverByUserId,
  ActorsResolverByFollowerId,
  ActorsResolverByFollowingId,
} from '../domain/actor/actor.ts';
import {
  Follow as DomainFollow,
  type FollowRequestedStore,
  type FollowResolver,
  type UndoFollowingProcessedStore,
} from '../domain/follow/follow.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { MuteResolver } from '../domain/mute/mute.ts';
import type { PostsResolverByActorIds, PostsResolverByActorIdWithPagination } from '../domain/post/post.ts';
import type { SessionResolver, SessionWithUserAndActorResolver } from '../domain/session/session.ts';
import type { UserResolver, UserWithLocalActorResolverByUsername } from '../domain/user/user.ts';
import {
  composeSessionWithUserAndActorResolver,
  resolveSessionWithUserAndActorWith,
  resolveUserWithLocalActorByUsernameWith,
} from '../useCase/helper/resolve.ts';
import type { IoriCoreRuntimePorts, WorkerRemoteActorAction } from './ports.ts';

export type WorkerRemoteActorActionInput = Parameters<WorkerRemoteActorAction>[0];

type WorkerRemoteActorActionsDeps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  sessionWithUserAndActorResolver?: SessionWithUserAndActorResolver;
  actorResolverById: ActorResolverById;
  followResolver: FollowResolver;
  followRequestedStore: FollowRequestedStore;
  undoFollowingProcessedStore: UndoFollowingProcessedStore;
}>;

const actionActors = async (
  deps: Pick<
    WorkerRemoteActorActionsDeps,
    | 'actorResolverById'
    | 'actorResolverByUserId'
    | 'sessionResolver'
    | 'sessionWithUserAndActorResolver'
    | 'userResolver'
  >,
  input: WorkerRemoteActorActionInput,
) => {
  const authenticated = await resolveSessionWithUserAndActorWith(
    deps.sessionWithUserAndActorResolver
      ?? composeSessionWithUserAndActorResolver(deps.sessionResolver, deps.userResolver, deps.actorResolverByUserId),
    Instant.now(),
  )(input.sessionId);
  if (!authenticated.ok) return RA.err({ message: authenticated.err.message });
  const following = await deps.actorResolverById.resolve(input.actorId);
  if (!following.ok || following.val === undefined || following.val.type !== 'remote') {
    return RA.err({ message: `Remote actor not found: ${input.actorId}` });
  }
  return RA.ok({ user: authenticated.val.user, follower: authenticated.val.actor, following: following.val });
};

export const createWorkerRemoteActorActions = (
  deps: WorkerRemoteActorActionsDeps,
): Readonly<{
  followRemoteActor: WorkerRemoteActorAction;
  unfollowRemoteActor: WorkerRemoteActorAction;
}> => ({
  followRemoteActor: async (input) => {
    const actors = await actionActors(deps, input);
    if (!actors.ok) return actors;
    const { user, follower, following } = actors.val;
    const requested = DomainFollow.requestFollow({
      followerId: follower.id,
      followingId: following.id,
    }, Instant.now());
    const stored = await deps.followRequestedStore.store(requested);
    if (!stored.ok) return RA.err({ message: String(stored.err) });
    await input.ctx.sendActivity(
      { username: user.username },
      { id: new URL(following.uri), inboxId: new URL(following.inboxUrl) },
      new ActivityPubFollow({
        id: new URL(`${follower.uri}#follows/${following.id}`),
        actor: input.ctx.getActorUri(user.username),
        object: new URL(following.uri),
        to: new URL(following.uri),
      }),
    );
    return RA.ok(undefined);
  },
  unfollowRemoteActor: async (input) => {
    const actors = await actionActors(deps, input);
    if (!actors.ok) return actors;
    const { user, follower, following } = actors.val;
    const existing = await deps.followResolver.resolve({
      followerId: follower.id,
      followingId: following.id,
    });
    if (!existing.ok || existing.val === undefined) {
      return RA.err({ message: `Follow not found: ${follower.id} -> ${following.id}` });
    }
    const unfollowed = DomainFollow.undoFollow({
      followerId: follower.id,
      followingId: following.id,
    }, Instant.now());
    const stored = await deps.undoFollowingProcessedStore.store(unfollowed);
    if (!stored.ok) return RA.err({ message: String(stored.err) });
    const followActivityId = new URL(`${follower.uri}#follows/${following.id}`);
    await input.ctx.sendActivity(
      { username: user.username },
      { id: new URL(following.uri), inboxId: new URL(following.inboxUrl) },
      new Undo({
        id: new URL(`${follower.uri}#undo-follows/${following.id}`),
        actor: input.ctx.getActorUri(user.username),
        object: new ActivityPubFollow({
          id: followActivityId,
          actor: input.ctx.getActorUri(user.username),
          object: new URL(following.uri),
        }),
        to: new URL(following.uri),
      }),
    );
    return RA.ok(undefined);
  },
});

export const createWorkerGetUserPostsUseCase = (
  deps: Readonly<{
    userWithLocalActorResolverByUsername: UserWithLocalActorResolverByUsername;
    actorsResolverByFollowerId: ActorsResolverByFollowerId;
    actorsResolverByFollowingId: ActorsResolverByFollowingId;
    postsResolverByActorIds: PostsResolverByActorIds;
  }>,
): IoriCoreRuntimePorts['getUserPostsUseCase'] => ({
  run: async ({ username, createdAt }) => {
    const found = await resolveUserWithLocalActorByUsernameWith(deps.userWithLocalActorResolverByUsername)(username);
    if (!found.ok) return found;
    const { user, actor } = found.val;
    const [following, followers, posts] = await Promise.all([
      deps.actorsResolverByFollowerId.resolve(actor.id),
      deps.actorsResolverByFollowingId.resolve(actor.id),
      deps.postsResolverByActorIds.resolve({
        actorIds: [actor.id],
        currentActorId: undefined,
        createdAt,
      }),
    ]);
    if (!following.ok) return following;
    if (!followers.ok) return followers;
    if (!posts.ok) return posts;
    return RA.ok({
      user,
      actor,
      following: following.val,
      followers: followers.val,
      posts: posts.val,
    });
  },
});

export const createWorkerGetRemoteActorPostsUseCase = (
  deps: Readonly<{
    sessionResolver: SessionResolver;
    userResolver: UserResolver;
    actorResolverByUserId: ActorResolverByUserId;
    sessionWithUserAndActorResolver?: SessionWithUserAndActorResolver;
    actorResolverById: ActorResolverById;
    followResolver: FollowResolver;
    muteResolver: MuteResolver;
    postsResolverByActorIdWithPagination: PostsResolverByActorIdWithPagination;
  }>,
): IoriCoreRuntimePorts['getRemoteActorPostsUseCase'] => ({
  run: async ({ sessionId, actorId, createdAt }) => {
    const [authenticated, actor] = await Promise.all([
      resolveSessionWithUserAndActorWith(
        deps.sessionWithUserAndActorResolver
          ?? composeSessionWithUserAndActorResolver(
            deps.sessionResolver,
            deps.userResolver,
            deps.actorResolverByUserId,
          ),
        Instant.now(),
      )(sessionId),
      deps.actorResolverById.resolve(actorId),
    ]);
    if (!authenticated.ok) return authenticated;
    if (!actor.ok) return actor;
    const { user, actor: currentActor } = authenticated.val;
    if (actor.val === undefined || actor.val.type !== 'remote') {
      return RA.err({ message: `Remote actor not found: ${actorId}` });
    }
    const [follow, mute, posts] = await Promise.all([
      deps.followResolver.resolve({ followerId: currentActor.id, followingId: actor.val.id }),
      deps.muteResolver.resolve({ userId: user.id, mutedActorId: actor.val.id }),
      deps.postsResolverByActorIdWithPagination.resolve({
        actorId: actor.val.id,
        currentActorId: currentActor.id,
        createdAt,
      }),
    ]);
    if (!posts.ok) return posts;
    return RA.ok({
      remoteActor: actor.val,
      isFollowing: follow.ok && follow.val !== undefined,
      isMuted: mute.ok && mute.val !== undefined,
      posts: posts.val,
    });
  },
});
