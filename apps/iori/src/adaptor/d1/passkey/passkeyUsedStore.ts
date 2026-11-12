import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { PasskeyUsedStore } from '../../../domain/passkey/passkeyCredential.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { domainEventsTable, passkeyCredentialsTable } from '../schema.ts';

export const createD1PasskeyUsedStore = (db: IoriD1Db): PasskeyUsedStore => ({
  store: async (event) => {
    await db.batch([
      db.update(passkeyCredentialsTable)
        .set({
          counter: event.eventPayload.counter,
          lastUsedAt: new Date(event.eventPayload.lastUsedAt),
        })
        .where(eq(passkeyCredentialsTable.credentialId, event.eventPayload.credentialId)),
      db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
    ]);
    return RA.ok(undefined);
  },
});
