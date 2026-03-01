import { RA } from '@iwasa-kosui/result';

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
}>;

type Ok = Readonly<{
  like: RemoteLike;
}>;

type Err = LikeNotFoundError;

export type RemoveReceivedLikeUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  remoteLikeDeletedStore: RemoteLikeDeletedStore;
  remoteLikeResolverByActivityUri: RemoteLikeResolverByActivityUri;
}>;

const create = ({
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
      RA.andThen(({ like, likeActivityUri }) => {
        if (!like) {
          return RA.err(LikeNotFoundError.create({ likeActivityUri }));
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
