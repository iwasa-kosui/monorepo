import { RA } from '@iwasa-kosui/result';

import type { ActorResolverById } from '../adaptor/pg/actor/actorResolverById.ts';
import { ActorNotFoundError, UndoActorMismatchError } from '../domain/actor/actor.ts';
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
  actorUri: string;
}>;

type Ok = Readonly<{
  emojiReact: EmojiReact;
}>;

type Err = EmojiReactNotFoundError | ActorNotFoundError | UndoActorMismatchError;

export type RemoveReceivedEmojiReactUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  actorResolverById: ActorResolverById;
  emojiReactDeletedStore: EmojiReactDeletedStore;
  emojiReactResolverByActivityUri: EmojiReactResolverByActivityUri;
}>;

const create = ({
  actorResolverById,
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
      RA.andThen(({ emojiReact, emojiReactActivityUri, actorUri }) => {
        if (!emojiReact) {
          return RA.err(EmojiReactNotFoundError.create({ emojiReactActivityUri }));
        }
        return RA.ok({ emojiReact, emojiReactActivityUri, actorUri });
      }),
      RA.andBind('storedActor', ({ emojiReact }) => actorResolverById.resolve(emojiReact.actorId)),
      RA.andThen(({ emojiReact, storedActor, actorUri, emojiReactActivityUri }): RA<
        { emojiReact: EmojiReact },
        ActorNotFoundError | UndoActorMismatchError
      > => {
        if (!storedActor) {
          return RA.err(ActorNotFoundError.create(emojiReact.actorId));
        }
        if (storedActor.uri !== actorUri) {
          return RA.err(
            UndoActorMismatchError.create({
              activityUri: emojiReactActivityUri,
              storedActorUri: storedActor.uri,
              undoActorUri: actorUri,
            }),
          );
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
