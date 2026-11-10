import { RA } from '@iwasa-kosui/result';
import { inArray } from 'drizzle-orm';

import type { EmojiReactDeletedStore } from '../../../domain/emojiReact/emojiReact.ts';
import type { IoriD1Db } from '../client.ts';
import { domainEventsTable, emojiReactsTable } from '../schema.ts';

export const createD1EmojiReactDeletedStore = (db: IoriD1Db): EmojiReactDeletedStore => ({
  store: async (...events) => {
    if (events.length === 0) return RA.ok(undefined);
    await db.batch([
      db.delete(emojiReactsTable).where(
        inArray(emojiReactsTable.emojiReactId, events.map((event) => event.eventPayload.emojiReactId)),
      ),
      ...events.map((event) =>
        db.insert(domainEventsTable).values({
          eventId: event.eventId,
          aggregateId: JSON.stringify(event.aggregateId),
          aggregateName: event.aggregateName,
          aggregateState: null,
          eventName: event.eventName,
          eventPayload: JSON.stringify(event.eventPayload),
          occurredAt: new Date(event.occurredAt),
        })
      ),
    ]);
    return RA.ok(undefined);
  },
});
