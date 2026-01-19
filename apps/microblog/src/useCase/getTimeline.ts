import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import type { MutedActorIdsResolverByMuterId } from '../domain/mute/mute.ts';
import { SessionExpiredError, type SessionResolver } from '../domain/session/session.ts';
import type { SessionId } from '../domain/session/sessionId.ts';
import type { TimelineItemsResolverByActorIds, TimelineItemWithPost } from '../domain/timeline/timelineItem.ts';
import { type User, UserNotFoundError, type UserResolver } from '../domain/user/user.ts';
import type {
  Actor,
  ActorResolverByUserId,
  ActorsResolverByFollowerId,
  ActorsResolverByFollowingId,
} from './../domain/actor/actor.ts';
import { resolveLocalActorWith, resolveSessionWith, resolveUserWith } from './helper/resolve.ts';
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
  timelineItemsResolverByActorIds: TimelineItemsResolverByActorIds;
  actorsResolverByFollowerId: ActorsResolverByFollowerId;
  actorsResolverByFollowingId: ActorsResolverByFollowingId;
  mutedActorIdsResolverByMuterId: MutedActorIdsResolverByMuterId;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  timelineItemsResolverByActorIds,
  actorsResolverByFollowerId,
  actorsResolverByFollowingId,
  mutedActorIdsResolverByMuterId,
}: Deps): GetTimelineUseCase => {
  const now = Instant.now();
  const resolveSession = resolveSessionWith(sessionResolver, now);
  const resolveUser = resolveUserWith(userResolver);
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('session', ({ sessionId }) => resolveSession(sessionId)),
      RA.andBind('user', ({ session }) => resolveUser(session.userId)),
      RA.andBind('actor', ({ user }) => resolveLocalActor(user.id)),
      RA.andBind('mutedActorIds', ({ user }) => mutedActorIdsResolverByMuterId.resolve({ muterId: user.id })),
      RA.andBind('following', ({ actor }) => actorsResolverByFollowerId.resolve(actor.id)),
      RA.andBind('followers', ({ actor }) => actorsResolverByFollowingId.resolve(actor.id)),
      RA.andBind('timelineItems', async ({ actor, following, mutedActorIds }) => {
        const mutedActorIdSet = new Set(mutedActorIds);
        const actorIds = [actor.id, ...following.map((a) => a.id)].filter((id) => !mutedActorIdSet.has(id));
        const items = await timelineItemsResolverByActorIds.resolve({
          actorIds,
          currentActorId: actor.id,
          createdAt: input.createdAt,
        });
        if (!items.ok) {
          return items;
        }
        // Filter out items where the post author is muted
        const filteredItems = items.val.filter((item) => !mutedActorIdSet.has(item.post.actorId));
        return RA.ok(filteredItems);
      }),
    );

  return { run };
};

export const GetTimelineUseCase = {
  create,
} as const;
