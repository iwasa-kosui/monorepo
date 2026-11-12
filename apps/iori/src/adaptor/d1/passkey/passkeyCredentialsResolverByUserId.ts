import { RA } from '@iwasa-kosui/result';
import { asc, eq } from 'drizzle-orm';

import type { PasskeyCredentialsResolverByUserId } from '../../../domain/passkey/passkeyCredential.ts';
import type { IoriD1Db } from '../client.ts';
import { passkeyCredentialsTable } from '../schema.ts';
import { toPasskeyCredential } from './passkeyCredentialRow.ts';

export const createD1PasskeyCredentialsResolverByUserId = (db: IoriD1Db): PasskeyCredentialsResolverByUserId => ({
  resolve: async (userId) => {
    const rows = await db.select().from(passkeyCredentialsTable)
      .where(eq(passkeyCredentialsTable.userId, userId))
      .orderBy(asc(passkeyCredentialsTable.createdAt), asc(passkeyCredentialsTable.credentialId));
    return RA.ok(rows.map(toPasskeyCredential));
  },
});
