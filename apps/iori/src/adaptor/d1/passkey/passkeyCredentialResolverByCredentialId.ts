import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { PasskeyCredentialResolverByCredentialId } from '../../../domain/passkey/passkeyCredential.ts';
import type { IoriD1Db } from '../client.ts';
import { passkeyCredentialsTable } from '../schema.ts';
import { toPasskeyCredential } from './passkeyCredentialRow.ts';

export const createD1PasskeyCredentialResolverByCredentialId = (
  db: IoriD1Db,
): PasskeyCredentialResolverByCredentialId => ({
  resolve: async (credentialId) => {
    const [row] = await db.select().from(passkeyCredentialsTable)
      .where(eq(passkeyCredentialsTable.credentialId, credentialId)).limit(1);
    return RA.ok(row === undefined ? undefined : toPasskeyCredential(row));
  },
});
