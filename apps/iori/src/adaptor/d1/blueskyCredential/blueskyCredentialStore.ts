import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import {
  BlueskyStoredCredential,
  type BlueskyStoredCredentialDeletedStore,
  type BlueskyStoredCredentialResolver,
  type BlueskyStoredCredentialSavedStore,
} from '../../../domain/blueskyCredential/blueskyCredential.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyCredentialsTable } from '../schema.ts';

export const BLUESKY_CREDENTIAL_ID = 'default';

export const createD1BlueskyStoredCredentialResolver = (db: IoriD1Db): BlueskyStoredCredentialResolver => ({
  resolve: async () => {
    const [row] = await db.select().from(blueskyCredentialsTable)
      .where(eq(blueskyCredentialsTable.id, BLUESKY_CREDENTIAL_ID)).limit(1);
    return RA.ok(
      row === undefined ? undefined : BlueskyStoredCredential.orThrow({
        identifier: row.identifier,
        did: row.did,
        handle: row.handle,
        appPasswordCiphertext: row.appPasswordCiphertext,
        appPasswordIv: row.appPasswordIv,
        keyVersion: row.keyVersion,
        chatPermitted: row.chatPermitted,
        verifiedAt: row.verifiedAt.getTime() as BlueskyStoredCredential['verifiedAt'],
        updatedAt: row.updatedAt.getTime() as BlueskyStoredCredential['updatedAt'],
      }),
    );
  },
});

export const createD1BlueskyStoredCredentialSavedStore = (db: IoriD1Db): BlueskyStoredCredentialSavedStore => ({
  save: async (credential) => {
    const values = {
      ...credential,
      verifiedAt: new Date(credential.verifiedAt),
      updatedAt: new Date(credential.updatedAt),
    };
    await db.insert(blueskyCredentialsTable).values({ id: BLUESKY_CREDENTIAL_ID, ...values }).onConflictDoUpdate({
      target: blueskyCredentialsTable.id,
      set: values,
    });
    return RA.ok(undefined);
  },
});

export const createD1BlueskyStoredCredentialDeletedStore = (db: IoriD1Db): BlueskyStoredCredentialDeletedStore => ({
  delete: async () => {
    await db.delete(blueskyCredentialsTable).where(eq(blueskyCredentialsTable.id, BLUESKY_CREDENTIAL_ID));
    return RA.ok(undefined);
  },
});
