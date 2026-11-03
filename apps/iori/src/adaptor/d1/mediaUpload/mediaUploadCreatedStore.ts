import { RA } from '@iwasa-kosui/result';

import type { MediaUploadCreatedStore } from '../../../domain/mediaUpload/mediaUpload.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { domainEventsTable, mediaUploadsTable } from '../schema.ts';

export const createD1MediaUploadCreatedStore = (db: IoriD1Db): MediaUploadCreatedStore => ({
  store: async (...events) => {
    const [first, ...rest] = events.flatMap((event) => [
      db.insert(mediaUploadsTable).values({
        ...event.aggregateState,
        createdAt: new Date(event.aggregateState.createdAt),
      }),
      db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
    ]);
    if (first !== undefined) await db.batch([first, ...rest]);
    return RA.ok(undefined);
  },
});
