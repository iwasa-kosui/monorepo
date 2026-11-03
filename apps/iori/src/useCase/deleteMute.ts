import { RA } from '@iwasa-kosui/result';

import type { ActorId } from '../domain/actor/actorId.ts';
import { Instant } from '../domain/instant/instant.ts';
import { Mute, type MuteDeletedStore, type MuteResolver, NotMutedError } from '../domain/mute/mute.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import { type Requester, resolveRequesterUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input =
  & Requester
  & Readonly<{
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
  const resolveRequesterUser = resolveRequesterUserWith(sessionResolver, userResolver, now);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('user', (input) => resolveRequesterUser(input)),
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
