import { RA } from '@iwasa-kosui/result';

import {
  EmojiReact,
  type EmojiReactDeletedStore,
  EmojiReactNotFoundError,
  type EmojiReactResolverByActivityUri,
} from '../domain/emojiReact/emojiReact.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  emojiReactActivityUri: string;
}>;

type Ok = Readonly<{
  emojiReact: EmojiReact;
}>;

type Err = EmojiReactNotFoundError;

export type RemoveReceivedEmojiReactUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  emojiReactDeletedStore: EmojiReactDeletedStore;
  emojiReactResolverByActivityUri: EmojiReactResolverByActivityUri;
}>;

const create = ({
  emojiReactDeletedStore,
  emojiReactResolverByActivityUri,
}: Deps): RemoveReceivedEmojiReactUseCase => {
  const run = async (input: Input) => {
    const now = Instant.now();

    return RA.flow(
      RA.ok(input),
      RA.andBind(
        'emojiReact',
        ({ emojiReactActivityUri }) => emojiReactResolverByActivityUri.resolve({ emojiReactActivityUri }),
      ),
      RA.andThen(({ emojiReact, emojiReactActivityUri }) => {
        if (!emojiReact) {
          return RA.err(EmojiReactNotFoundError.create({ emojiReactActivityUri }));
        }
        return RA.ok({ emojiReact });
      }),
      RA.andThrough(({ emojiReact }) => {
        const event = EmojiReact.deleteEmojiReact(emojiReact, now);
        return emojiReactDeletedStore.store(event);
      }),
      RA.map(({ emojiReact }) => ({ emojiReact })),
    );
  };

  return { run };
};

export const RemoveReceivedEmojiReactUseCase = {
  create,
} as const;
