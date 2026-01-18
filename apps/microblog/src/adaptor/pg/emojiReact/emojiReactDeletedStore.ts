import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { EmojiReactDeleted, EmojiReactDeletedStore } from '../../../domain/emojiReact/emojiReact.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, emojiReactsTable } from '../schema.ts';

const store = async (event: EmojiReactDeleted): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx.delete(emojiReactsTable)
      .where(eq(emojiReactsTable.emojiReactId, event.aggregateId.emojiReactId));
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
  (): EmojiReactDeletedStore => ({
    store,
  }),
);

export const PgEmojiReactDeletedStore = {
  getInstance,
} as const;
