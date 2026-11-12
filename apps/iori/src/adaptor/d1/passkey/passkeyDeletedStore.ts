import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { PasskeyDeletedStore } from '../../../domain/passkey/passkeyCredential.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { domainEventsTable, passkeyCredentialsTable } from '../schema.ts';

export const createD1PasskeyDeletedStore = (db: IoriD1Db): PasskeyDeletedStore => ({
  store: async (event) => {
    await db.batch([
      db.delete(passkeyCredentialsTable)
        .where(eq(passkeyCredentialsTable.credentialId, event.eventPayload.credentialId)),
      db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
    ]);
    return RA.ok(undefined);
  },
});
