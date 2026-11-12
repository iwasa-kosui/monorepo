import { RA } from '@iwasa-kosui/result';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import type { ActorId } from '../domain/actor/actorId.ts';
import {
  AlreadyBlockedError,
  Block,
  type BlockCreatedStore,
  type BlockResolver,
  CannotBlockSelfError,
} from '../domain/block/block.ts';
import { BlockId } from '../domain/block/blockId.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import { type Requester, resolveLocalActorWith, resolveRequesterUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input =
  & Requester
  & Readonly<{
    blockedActorId: ActorId;
  }>;

type Ok = void;

type Err =
  | SessionExpiredError
  | UserNotFoundError
  | AlreadyBlockedError
  | CannotBlockSelfError;

export type CreateBlockUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  blockCreatedStore: BlockCreatedStore;
  blockResolver: BlockResolver;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  blockCreatedStore,
  blockResolver,
}: Deps): CreateBlockUseCase => {
  const now = Instant.now();
  const resolveRequesterUser = resolveRequesterUserWith(sessionResolver, userResolver, now);
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('user', (input) => resolveRequesterUser(input)),
      RA.andBind('actor', ({ user }) => resolveLocalActor(user.id)),
      RA.andThrough(({ actor, blockedActorId }) => {
        if (actor.id === blockedActorId) {
          return RA.err(
            CannotBlockSelfError.create({ userId: actor.userId, actorId: actor.id }),
          );
        }
        return RA.ok(undefined);
      }),
      RA.andThrough(async ({ user, blockedActorId }) => {
        return RA.flow(
          blockResolver.resolve({
            userId: user.id,
            blockedActorId,
          }),
          RA.andThen((block) => {
            if (block !== undefined) {
              return RA.err(
                AlreadyBlockedError.create({ userId: user.id, blockedActorId }),
              );
            }
            return RA.ok(undefined);
          }),
        );
      }),
      RA.bind('blockCreated', ({ user, blockedActorId }) =>
        Block.createBlock(
          {
            blockId: BlockId.generate(),
            userId: user.id,
            blockedActorId,
          },
          now,
        )),
      RA.andThrough(async ({ blockCreated }) => blockCreatedStore.store(blockCreated)),
      RA.map(() => undefined),
    );

  return { run };
};

export const CreateBlockUseCase = {
  create,
} as const;
