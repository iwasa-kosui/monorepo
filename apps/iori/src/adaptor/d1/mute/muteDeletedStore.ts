import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { MuteDeletedStore } from '../../../domain/mute/mute.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { domainEventsTable, mutesTable } from '../schema.ts';

export const createD1MuteDeletedStore = (db: IoriD1Db): MuteDeletedStore => ({
  store: async (event) => {
    await db.batch([
      db.delete(mutesTable).where(eq(mutesTable.muteId, event.eventPayload.muteId)),
      db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
    ]);
    return RA.ok(undefined);
  },
});
