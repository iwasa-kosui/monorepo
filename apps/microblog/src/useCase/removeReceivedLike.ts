import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import {
  LikeV2,
  type LikeV2DeletedStore,
  LikeV2NotFoundError,
  type LikeV2ResolverByActivityUri,
} from '../domain/like/likeV2.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  likeActivityUri: string;
}>;

type Ok = Readonly<{
  like: LikeV2;
}>;

type Err = LikeV2NotFoundError;

export type RemoveReceivedLikeUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  likeV2DeletedStore: LikeV2DeletedStore;
  likeV2ResolverByActivityUri: LikeV2ResolverByActivityUri;
}>;

const create = ({
  likeV2DeletedStore,
  likeV2ResolverByActivityUri,
}: Deps): RemoveReceivedLikeUseCase => {
  const run = async (input: Input) => {
    const now = Instant.now();

    return RA.flow(
      RA.ok(input),
      RA.andBind(
        'like',
        ({ likeActivityUri }) => likeV2ResolverByActivityUri.resolve({ likeActivityUri }),
      ),
      RA.andThen(({ like, likeActivityUri }) => {
        if (!like) {
          return RA.err(LikeV2NotFoundError.create({ likeActivityUri }));
        }
        return RA.ok({ like });
      }),
      RA.andThrough(({ like }) => {
        const event = LikeV2.deleteLikeV2(like, now);
        return likeV2DeletedStore.store(event);
      }),
      RA.map(({ like }) => ({ like })),
    );
  };

  return { run };
};

export const RemoveReceivedLikeUseCase = {
  create,
} as const;
