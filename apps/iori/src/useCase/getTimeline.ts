import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import type { MutedActorIdsResolverByUserId } from '../domain/mute/mute.ts';
import {
  SessionExpiredError,
  type SessionResolver,
  type SessionWithUserAndActorResolver,
} from '../domain/session/session.ts';
import type { SessionId } from '../domain/session/sessionId.ts';
import type { TimelineItemsResolverByActorIds, TimelineItemWithPost } from '../domain/timeline/timelineItem.ts';
import { type User, UserNotFoundError, type UserResolver } from '../domain/user/user.ts';
import type {
  Actor,
  ActorResolverByUserId,
  ActorsResolverByFollowerId,
  ActorsResolverByFollowingId,
} from './../domain/actor/actor.ts';
import { composeSessionWithUserAndActorResolver, resolveSessionWithUserAndActorWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  sessionId: SessionId;
  createdAt: Instant | undefined;
}>;

type Ok = Readonly<{
  user: User;
  timelineItems: ReadonlyArray<TimelineItemWithPost>;
  actor: Actor;
  following: ReadonlyArray<Actor>;
  followers: ReadonlyArray<Actor>;
}>;

type Err = SessionExpiredError | UserNotFoundError;

export type GetTimelineUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  sessionWithUserAndActorResolver?: SessionWithUserAndActorResolver;
  timelineItemsResolverByActorIds: TimelineItemsResolverByActorIds;
  actorsResolverByFollowerId: ActorsResolverByFollowerId;
  actorsResolverByFollowingId: ActorsResolverByFollowingId;
  mutedActorIdsResolverByUserId: MutedActorIdsResolverByUserId;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  sessionWithUserAndActorResolver,
  timelineItemsResolverByActorIds,
  actorsResolverByFollowerId,
  actorsResolverByFollowingId,
  mutedActorIdsResolverByUserId,
}: Deps): GetTimelineUseCase => {
  const now = Instant.now();
  const resolveSessionUserActor = resolveSessionWithUserAndActorWith(
    sessionWithUserAndActorResolver
      ?? composeSessionWithUserAndActorResolver(sessionResolver, userResolver, actorResolverByUserId),
    now,
  );

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('resolved', ({ sessionId }) => resolveSessionUserActor(sessionId)),
      RA.map(({ resolved, ...rest }) => ({ ...rest, ...resolved })),
      RA.andThen(async (context) => {
        const [following, followers, mutedActorIds] = await Promise.all([
          actorsResolverByFollowerId.resolve(context.actor.id),
          actorsResolverByFollowingId.resolve(context.actor.id),
          mutedActorIdsResolverByUserId.resolve(context.user.id),
        ]);
        if (!following.ok) return following;
        if (!followers.ok) return followers;
        if (!mutedActorIds.ok) return mutedActorIds;
        return RA.ok({
          ...context,
          following: following.val,
          followers: followers.val,
          mutedActorIds: mutedActorIds.val,
        });
      }),
      RA.andBind('timelineItems', async ({ actor, following, mutedActorIds }) => {
        const mutedActorIdSet = new Set(mutedActorIds);
        const actorIds = [actor.id, ...following.map((a) => a.id)]
          .filter((id) => !mutedActorIdSet.has(id));
        return timelineItemsResolverByActorIds.resolve({
          actorIds,
          currentActorId: actor.id,
          createdAt: input.createdAt,
          mutedActorIds,
        });
      }),
    );

  return { run };
};

export const createGetTimelineUseCase = (deps: Deps): GetTimelineUseCase => create(deps);

export const GetTimelineUseCase = {
  create,
} as const;
