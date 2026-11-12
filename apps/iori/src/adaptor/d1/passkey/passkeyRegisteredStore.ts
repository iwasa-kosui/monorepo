import { RA } from '@iwasa-kosui/result';

import type { PasskeyRegisteredStore } from '../../../domain/passkey/passkeyCredential.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { domainEventsTable, passkeyCredentialsTable } from '../schema.ts';

export const createD1PasskeyRegisteredStore = (db: IoriD1Db): PasskeyRegisteredStore => ({
  store: async (event) => {
    const credential = event.aggregateState;
    await db.batch([
      db.insert(passkeyCredentialsTable).values({
        ...credential,
        transports: JSON.stringify(credential.transports),
        createdAt: new Date(credential.createdAt),
        lastUsedAt: credential.lastUsedAt === null ? null : new Date(credential.lastUsedAt),
      }),
      db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
    ]);
    return RA.ok(undefined);
  },
});
