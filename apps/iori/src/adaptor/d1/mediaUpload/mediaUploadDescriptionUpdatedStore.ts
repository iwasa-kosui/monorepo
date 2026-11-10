import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { MediaUploadDescriptionUpdatedStore } from '../../../domain/mediaUpload/mediaUpload.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { domainEventsTable, mediaUploadsTable } from '../schema.ts';

export const createD1MediaUploadDescriptionUpdatedStore = (db: IoriD1Db): MediaUploadDescriptionUpdatedStore => ({
  store: async (...events) => {
    const [first, ...rest] = events.flatMap((event) => [
      db.update(mediaUploadsTable).set({ description: event.eventPayload.description }).where(
        eq(mediaUploadsTable.mediaId, event.eventPayload.mediaId),
      ),
      db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
    ]);
    if (first !== undefined) await db.batch([first, ...rest]);
    return RA.ok(undefined);
  },
});
