import { RA } from '@iwasa-kosui/result';

import { PgMuteDeletedStore } from '../adaptor/pg/mute/muteDeletedStore.ts';
import { PgMuteResolver } from '../adaptor/pg/mute/muteResolver.ts';
import type { ActorId } from '../domain/actor/actorId.ts';
import { Instant } from '../domain/instant/instant.ts';
import {
  Mute,
  type MuteAggregateId,
  type MuteDeletedStore,
  type MuteResolver,
  NotMutedError,
} from '../domain/mute/mute.ts';
import type { UserId } from '../domain/user/userId.ts';
import { singleton } from '../helper/singleton.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  muterId: UserId;
  mutedActorId: ActorId;
}>;

type Ok = MuteAggregateId;
type Err = NotMutedError;

export type UnmuteUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  muteResolver: MuteResolver;
  muteDeletedStore: MuteDeletedStore;
}>;

const create = ({
  muteResolver,
  muteDeletedStore,
}: Deps): UnmuteUseCase => {
  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('existingMute', ({ muterId, mutedActorId }) =>
        muteResolver.resolve({ muterId, mutedActorId })),
      RA.andThen(({ muterId, mutedActorId, existingMute }) => {
        if (!existingMute) {
          return RA.err(NotMutedError.create({ muterId, mutedActorId }));
        }
        const muteDeleted = Mute.deleteMute(existingMute, Instant.now());
        return RA.flow(
          RA.ok(muteDeleted.aggregateId),
          RA.andThrough(() => muteDeletedStore.store(muteDeleted)),
        );
      }),
    );

  return { run };
};

export const UnmuteUseCase = {
  create,
  getInstance: singleton(() =>
    create({
      muteResolver: PgMuteResolver.getInstance(),
      muteDeletedStore: PgMuteDeletedStore.getInstance(),
    })
  ),
} as const;
