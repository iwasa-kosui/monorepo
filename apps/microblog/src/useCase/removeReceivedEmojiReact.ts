import { RA } from '@iwasa-kosui/result';

import {
  EmojiReact,
  type EmojiReactDeletedStore,
  EmojiReactNotFoundError,
  type EmojiReactResolverByActivityUri,
} from '../domain/emojiReact/emojiReact.ts';
import { Instant } from '../domain/instant/instant.ts';
import {
  type EmojiReactNotificationDeletedStore,
  type EmojiReactNotificationResolverByActorIdAndPostIdAndEmoji,
  Notification,
} from '../domain/notification/notification.ts';
import { PostId } from '../domain/post/postId.ts';
import type { UseCase } from './useCase.ts';

const extractPostIdFromObjectUri = (objectUri: string): PostId | undefined => {
  const match = objectUri.match(/\/posts\/([a-f0-9-]+)$/);
  if (!match) {
    return undefined;
  }
  const result = PostId.parse(match[1]);
  if (!result.ok) {
    return undefined;
  }
  return result.val;
};

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
  emojiReactNotificationResolverByActorIdAndPostIdAndEmoji: EmojiReactNotificationResolverByActorIdAndPostIdAndEmoji;
  emojiReactNotificationDeletedStore: EmojiReactNotificationDeletedStore;
}>;

const create = ({
  emojiReactDeletedStore,
  emojiReactResolverByActivityUri,
  emojiReactNotificationResolverByActorIdAndPostIdAndEmoji,
  emojiReactNotificationDeletedStore,
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
      RA.andThrough(({ emojiReact }) => {
        const reactedPostId = extractPostIdFromObjectUri(emojiReact.objectUri);
        if (!reactedPostId) {
          return RA.ok(undefined);
        }
        return RA.flow(
          emojiReactNotificationResolverByActorIdAndPostIdAndEmoji.resolve({
            reactorActorId: emojiReact.actorId,
            reactedPostId,
            emoji: emojiReact.emoji,
          }),
          RA.andThen((notification) => {
            if (!notification) {
              return RA.ok(undefined);
            }
            const event = Notification.deleteEmojiReactNotification(notification, now);
            return emojiReactNotificationDeletedStore.store(event);
          }),
        );
      }),
      RA.map(({ emojiReact }) => ({ emojiReact })),
    );
  };

  return { run };
};

export const RemoveReceivedEmojiReactUseCase = {
  create,
} as const;
