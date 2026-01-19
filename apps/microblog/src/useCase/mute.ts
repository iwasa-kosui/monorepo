import { RA } from '@iwasa-kosui/result';

import { PgMuteCreatedStore } from '../adaptor/pg/mute/muteCreatedStore.ts';
import { PgMuteResolver } from '../adaptor/pg/mute/muteResolver.ts';
import type { ActorId } from '../domain/actor/actorId.ts';
import { Instant } from '../domain/instant/instant.ts';
import {
  AlreadyMutedError,
  Mute,
  type MuteAggregateId,
  type MuteCreatedStore,
  type MuteResolver,
} from '../domain/mute/mute.ts';
import type { UserId } from '../domain/user/userId.ts';
import { singleton } from '../helper/singleton.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  muterId: UserId;
  mutedActorId: ActorId;
}>;

type Ok = MuteAggregateId;
type Err = AlreadyMutedError;

export type MuteUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  muteResolver: MuteResolver;
  muteCreatedStore: MuteCreatedStore;
}>;

const create = ({
  muteResolver,
  muteCreatedStore,
}: Deps): MuteUseCase => {
  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('existingMute', ({ muterId, mutedActorId }) =>
        muteResolver.resolve({ muterId, mutedActorId })),
      RA.andThen(({ muterId, mutedActorId, existingMute }) => {
        if (existingMute) {
          return RA.err(AlreadyMutedError.create({ muterId, mutedActorId }));
        }
        const muteCreated = Mute.createMute({ muterId, mutedActorId }, Instant.now());
        return RA.flow(
          RA.ok(muteCreated.aggregateId),
          RA.andThrough(() => muteCreatedStore.store(muteCreated)),
        );
      }),
    );

  return { run };
};

export const MuteUseCase = {
  create,
  getInstance: singleton(() =>
    create({
      muteResolver: PgMuteResolver.getInstance(),
      muteCreatedStore: PgMuteCreatedStore.getInstance(),
    })
  ),
} as const;
