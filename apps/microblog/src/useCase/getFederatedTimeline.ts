import { RA } from '@iwasa-kosui/result';

import type {
  FederatedTimelineItemsResolver,
  FederatedTimelineItemWithPost,
} from '../domain/federatedTimeline/federatedTimelineItem.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { MutedActorIdsResolverByUserId } from '../domain/mute/mute.ts';
import { SessionExpiredError, type SessionResolver } from '../domain/session/session.ts';
import type { SessionId } from '../domain/session/sessionId.ts';
import { UserNotFoundError, type UserResolver } from '../domain/user/user.ts';
import type { ActorResolverByUserId } from './../domain/actor/actor.ts';
import { resolveLocalActorWith, resolveSessionWith, resolveUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  sessionId: SessionId;
  receivedAt: Instant | undefined;
}>;

type Ok = Readonly<{
  items: ReadonlyArray<FederatedTimelineItemWithPost>;
  nextCursor: Instant | undefined;
}>;

type Err = SessionExpiredError | UserNotFoundError;

export type GetFederatedTimelineUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  federatedTimelineItemsResolver: FederatedTimelineItemsResolver;
  mutedActorIdsResolverByUserId: MutedActorIdsResolverByUserId;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  federatedTimelineItemsResolver,
  mutedActorIdsResolverByUserId,
}: Deps): GetFederatedTimelineUseCase => {
  const now = Date.now() as Instant;
  const resolveSession = resolveSessionWith(sessionResolver, now);
  const resolveUser = resolveUserWith(userResolver);
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('session', ({ sessionId }) => resolveSession(sessionId)),
      RA.andBind('user', ({ session }) => resolveUser(session.userId)),
      RA.andBind('actor', ({ user }) => resolveLocalActor(user.id)),
      RA.andBind('mutedActorIds', ({ user }) => mutedActorIdsResolverByUserId.resolve(user.id)),
      RA.andBind('items', ({ mutedActorIds, actor }) =>
        federatedTimelineItemsResolver.resolve({
          receivedAt: input.receivedAt,
          mutedActorIds,
          currentActorId: actor.id,
        })),
      RA.map(({ items }) => ({
        items,
        nextCursor: items.length > 0 ? items[items.length - 1].receivedAt : undefined,
      })),
    );

  return { run };
};

export const GetFederatedTimelineUseCase = {
  create,
} as const;
