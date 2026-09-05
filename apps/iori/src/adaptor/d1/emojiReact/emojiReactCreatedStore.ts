import { RA } from '@iwasa-kosui/result';

import type { EmojiReactCreatedStore } from '../../../domain/emojiReact/emojiReact.ts';
import type { IoriD1Db } from '../client.ts';
import { domainEventsTable, emojiReactsTable } from '../schema.ts';

export const createD1EmojiReactCreatedStore = (db: IoriD1Db): EmojiReactCreatedStore => ({
  store: async (event) => {
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
    return RA.ok(undefined);
  },
});
