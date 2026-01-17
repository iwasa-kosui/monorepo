import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import {
  ReceivedLike,
  type ReceivedLikeDeletedStore,
  ReceivedLikeNotFoundError,
  type ReceivedLikeResolverByActivityUri,
} from '../domain/receivedLike/receivedLike.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  likeActivityUri: string;
}>;

type Ok = Readonly<{
  receivedLike: ReceivedLike;
}>;

type Err = ReceivedLikeNotFoundError;

export type RemoveReceivedLikeUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  receivedLikeDeletedStore: ReceivedLikeDeletedStore;
  receivedLikeResolverByActivityUri: ReceivedLikeResolverByActivityUri;
}>;

const create = ({
  receivedLikeDeletedStore,
  receivedLikeResolverByActivityUri,
}: Deps): RemoveReceivedLikeUseCase => {
  const run = async (input: Input) => {
    const now = Instant.now();

    return RA.flow(
      RA.ok(input),
      RA.andBind(
        'receivedLike',
        ({ likeActivityUri }) => receivedLikeResolverByActivityUri.resolve({ likeActivityUri }),
      ),
      RA.andThen(({ receivedLike, likeActivityUri }) => {
        if (!receivedLike) {
          return RA.err(ReceivedLikeNotFoundError.create({ likeActivityUri }));
        }
        return RA.ok({ receivedLike });
      }),
      RA.andThrough(({ receivedLike }) => {
        const event = ReceivedLike.deleteReceivedLike(receivedLike, now);
        return receivedLikeDeletedStore.store(event);
      }),
      RA.map(({ receivedLike }) => ({ receivedLike })),
    );
  };

  return { run };
};

export const RemoveReceivedLikeUseCase = {
  create,
} as const;
