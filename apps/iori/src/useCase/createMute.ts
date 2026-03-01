import { RA } from '@iwasa-kosui/result';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import type { ActorId } from '../domain/actor/actorId.ts';
import { Instant } from '../domain/instant/instant.ts';
import {
  AlreadyMutedError,
  CannotMuteSelfError,
  Mute,
  type MuteCreatedStore,
  type MuteResolver,
} from '../domain/mute/mute.ts';
import { MuteId } from '../domain/mute/muteId.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import type { SessionId } from '../domain/session/sessionId.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import { resolveLocalActorWith, resolveSessionWith, resolveUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  sessionId: SessionId;
  mutedActorId: ActorId;
}>;

type Ok = void;

type Err =
  | SessionExpiredError
  | UserNotFoundError
  | AlreadyMutedError
  | CannotMuteSelfError;

export type CreateMuteUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  muteCreatedStore: MuteCreatedStore;
  muteResolver: MuteResolver;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  muteCreatedStore,
  muteResolver,
}: Deps): CreateMuteUseCase => {
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
      // Check if trying to mute self
      RA.andThrough(({ actor, mutedActorId }) => {
        if (actor.id === mutedActorId) {
          return RA.err(
            CannotMuteSelfError.create({ userId: actor.userId, actorId: actor.id }),
          );
        }
        return RA.ok(undefined);
      }),
      // Check if already muted
      RA.andThrough(async ({ user, mutedActorId }) => {
        return RA.flow(
          muteResolver.resolve({
            userId: user.id,
            mutedActorId,
          }),
          RA.andThen((mute) => {
            if (mute !== undefined) {
              return RA.err(
                AlreadyMutedError.create({ userId: user.id, mutedActorId }),
              );
            }
            return RA.ok(undefined);
          }),
        );
      }),
      RA.bind('muteCreated', ({ user, mutedActorId }) =>
        Mute.createMute(
          {
            muteId: MuteId.generate(),
            userId: user.id,
            mutedActorId,
          },
          now,
        )),
      RA.andThrough(async ({ muteCreated }) => muteCreatedStore.store(muteCreated)),
      RA.map(() => undefined),
    );

  return { run };
};

export const CreateMuteUseCase = {
  create,
} as const;
