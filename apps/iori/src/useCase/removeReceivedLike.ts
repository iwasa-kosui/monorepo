import { RA } from '@iwasa-kosui/result';

import type { ActorResolverById } from '../adaptor/pg/actor/actorResolverById.ts';
import { ActorNotFoundError, UndoActorMismatchError } from '../domain/actor/actor.ts';
import { Instant } from '../domain/instant/instant.ts';
import {
  Like,
  LikeNotFoundError,
  type RemoteLike,
  type RemoteLikeDeletedStore,
  type RemoteLikeResolverByActivityUri,
} from '../domain/like/like.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  likeActivityUri: string;
  actorUri: string;
}>;

type Ok = Readonly<{
  like: RemoteLike;
}>;

type Err = LikeNotFoundError | ActorNotFoundError | UndoActorMismatchError;

export type RemoveReceivedLikeUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  actorResolverById: ActorResolverById;
  remoteLikeDeletedStore: RemoteLikeDeletedStore;
  remoteLikeResolverByActivityUri: RemoteLikeResolverByActivityUri;
}>;

const create = ({
  actorResolverById,
  remoteLikeDeletedStore,
  remoteLikeResolverByActivityUri,
}: Deps): RemoveReceivedLikeUseCase => {
  const run = async (input: Input) => {
    const now = Instant.now();

    return RA.flow(
      RA.ok(input),
      RA.andBind(
        'like',
        ({ likeActivityUri }) => remoteLikeResolverByActivityUri.resolve({ likeActivityUri }),
      ),
      RA.andThen(({ like, likeActivityUri, actorUri }) => {
        if (!like) {
          return RA.err(LikeNotFoundError.create({ likeActivityUri }));
        }
        return RA.ok({ like, likeActivityUri, actorUri });
      }),
      RA.andBind('storedActor', ({ like }) => actorResolverById.resolve(like.actorId)),
      RA.andThen(({ like, storedActor, actorUri, likeActivityUri }): RA<
        { like: RemoteLike },
        ActorNotFoundError | UndoActorMismatchError
      > => {
        if (!storedActor) {
          return RA.err(ActorNotFoundError.create(like.actorId));
        }
        if (storedActor.uri !== actorUri) {
          return RA.err(
            UndoActorMismatchError.create({
              activityUri: likeActivityUri,
              storedActorUri: storedActor.uri,
              undoActorUri: actorUri,
            }),
          );
        }
        return RA.ok({ like });
      }),
      RA.andThrough(({ like }) => {
        const event = Like.deleteRemoteLike(like, now);
        return remoteLikeDeletedStore.store(event);
      }),
      RA.map(({ like }) => ({ like })),
    );
  };

  return { run };
};

export const RemoveReceivedLikeUseCase = {
  create,
} as const;
