import { RA } from '@iwasa-kosui/result';

import type { EmojiReactCreated, EmojiReactCreatedStore } from '../../../domain/emojiReact/emojiReact.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, emojiReactsTable } from '../schema.ts';

const store = async (event: EmojiReactCreated): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx.insert(emojiReactsTable).values({
      emojiReactId: event.aggregateState.emojiReactId,
      actorId: event.aggregateState.actorId,
      postId: event.aggregateState.postId,
      emoji: event.aggregateState.emoji,
      emojiReactActivityUri: event.aggregateState.emojiReactActivityUri,
      emojiImageUrl: event.aggregateState.emojiImageUrl,
      createdAt: new Date(event.occurredAt),
    });
    await tx.insert(domainEventsTable).values({
      eventId: event.eventId,
      aggregateId: event.aggregateId,
      aggregateName: event.aggregateName,
      aggregateState: event.aggregateState,
      eventName: event.eventName,
      eventPayload: event.eventPayload,
      occurredAt: new Date(event.occurredAt),
    });
  });
  return RA.ok(undefined);
};

const getInstance = singleton(
  (): EmojiReactCreatedStore => ({
    store,
  }),
);

export const PgEmojiReactCreatedStore = {
  getInstance,
} as const;
