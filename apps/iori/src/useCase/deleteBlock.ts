import { RA } from '@iwasa-kosui/result';

import type { ActorId } from '../domain/actor/actorId.ts';
import { Block, type BlockDeletedStore, type BlockResolver, NotBlockedError } from '../domain/block/block.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import { type Requester, resolveRequesterUserWith } from './helper/resolve.ts';
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
  | NotBlockedError;

export type DeleteBlockUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  blockDeletedStore: BlockDeletedStore;
  blockResolver: BlockResolver;
}>;

const create = ({
  sessionResolver,
  userResolver,
  blockDeletedStore,
  blockResolver,
}: Deps): DeleteBlockUseCase => {
  const now = Instant.now();
  const resolveRequesterUser = resolveRequesterUserWith(sessionResolver, userResolver, now);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('user', (input) => resolveRequesterUser(input)),
      RA.andBind('block', async ({ user, blockedActorId }) => {
        return RA.flow(
          blockResolver.resolve({
            userId: user.id,
            blockedActorId,
          }),
          RA.andThen((block) => {
            if (block === undefined) {
              return RA.err(
                NotBlockedError.create({ userId: user.id, blockedActorId }),
              );
            }
            return RA.ok(block);
          }),
        );
      }),
      RA.bind('blockDeleted', ({ block }) => Block.deleteBlock(block, now)),
      RA.andThrough(async ({ blockDeleted }) => blockDeletedStore.store(blockDeleted)),
      RA.map(() => undefined),
    );

  return { run };
};

export const DeleteBlockUseCase = {
  create,
} as const;
