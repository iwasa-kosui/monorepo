import { RA } from '@iwasa-kosui/result';

import { AlreadyReactedError, type EmojiReactCreatedStore } from '../../../domain/emojiReact/emojiReact.ts';
import type { IoriD1Db } from '../client.ts';
import { domainEventsTable, emojiReactsTable } from '../schema.ts';

const actorPostEmojiUniqueViolation =
  'UNIQUE constraint failed: emoji_reacts.actorId, emoji_reacts.postId, emoji_reacts.emoji';

const isActorPostEmojiUniqueViolation = (error: unknown): boolean => {
  for (let current = error; current instanceof Error; current = current.cause) {
    if (current.message.includes(actorPostEmojiUniqueViolation)) return true;
  }
  return false;
};

export const createD1EmojiReactCreatedStore = (db: IoriD1Db): EmojiReactCreatedStore => ({
  store: async (event) => {
    try {
      await db.batch([
        db.insert(emojiReactsTable).values({ ...event.aggregateState, createdAt: new Date(event.occurredAt) }),
        db.insert(domainEventsTable).values({
          eventId: event.eventId,
          aggregateId: JSON.stringify(event.aggregateId),
          aggregateName: event.aggregateName,
          aggregateState: JSON.stringify(event.aggregateState),
          eventName: event.eventName,
          eventPayload: JSON.stringify(event.eventPayload),
          occurredAt: new Date(event.occurredAt),
        }),
      ]);
    } catch (error) {
      if (!isActorPostEmojiUniqueViolation(error)) throw error;
      const { actorId, postId, emoji } = event.aggregateState;
      return RA.err(AlreadyReactedError.create({ actorId, postId, emoji }));
    }
    return RA.ok(undefined);
  },
});
