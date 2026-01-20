import { RA } from '@iwasa-kosui/result';

import type { ActorId } from '../domain/actor/actorId.ts';
import { Instant } from '../domain/instant/instant.ts';
import { Mute, type MuteDeletedStore, type MuteResolver, NotMutedError } from '../domain/mute/mute.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import type { SessionId } from '../domain/session/sessionId.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import { resolveSessionWith, resolveUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  sessionId: SessionId;
  mutedActorId: ActorId;
}>;

type Ok = void;

type Err =
  | SessionExpiredError
  | UserNotFoundError
  | NotMutedError;

export type DeleteMuteUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  muteDeletedStore: MuteDeletedStore;
  muteResolver: MuteResolver;
}>;

const create = ({
  sessionResolver,
  userResolver,
  muteDeletedStore,
  muteResolver,
}: Deps): DeleteMuteUseCase => {
  const now = Instant.now();
  const resolveSession = resolveSessionWith(sessionResolver, now);
  const resolveUser = resolveUserWith(userResolver);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('session', ({ sessionId }) => resolveSession(sessionId)),
      RA.andBind('user', ({ session }) => resolveUser(session.userId)),
      // Check if muted
      RA.andBind('mute', async ({ user, mutedActorId }) => {
        return RA.flow(
          muteResolver.resolve({
            userId: user.id,
            mutedActorId,
          }),
          RA.andThen((mute) => {
            if (mute === undefined) {
              return RA.err(
                NotMutedError.create({ userId: user.id, mutedActorId }),
              );
            }
            return RA.ok(mute);
          }),
        );
      }),
      RA.bind('muteDeleted', ({ mute }) => Mute.deleteMute(mute, now)),
      RA.andThrough(async ({ muteDeleted }) => muteDeletedStore.store(muteDeleted)),
      RA.map(() => undefined),
    );

  return { run };
};

export const DeleteMuteUseCase = {
  create,
} as const;
