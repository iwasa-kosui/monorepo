import { RA } from '@iwasa-kosui/result';
import { and, eq, type SQL, sql } from 'drizzle-orm';

import {
  BlueskyStoredCredential,
  type BlueskyStoredCredentialDeletedStore,
  type BlueskyStoredCredentialResolver,
  type BlueskyStoredCredentialSavedStore,
} from '../../../domain/blueskyCredential/blueskyCredential.ts';
import type { IoriD1Db } from '../client.ts';
import { guardedInsert } from '../guardedInsert.ts';
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

export const blueskyStoredCredentialSaveQuery = (
  db: IoriD1Db,
  credential: BlueskyStoredCredential,
  guard: SQL = sql`true`,
) => {
  const values = {
    ...credential,
    verifiedAt: new Date(credential.verifiedAt),
    updatedAt: new Date(credential.updatedAt),
  };
  return guardedInsert(db, blueskyCredentialsTable, { id: BLUESKY_CREDENTIAL_ID, ...values }, guard)
    .onConflictDoUpdate({ target: blueskyCredentialsTable.id, set: values });
};

export const blueskyStoredCredentialDeleteQuery = (db: IoriD1Db, guard?: SQL) =>
  db.delete(blueskyCredentialsTable).where(and(eq(blueskyCredentialsTable.id, BLUESKY_CREDENTIAL_ID), guard));

export const createD1BlueskyStoredCredentialSavedStore = (db: IoriD1Db): BlueskyStoredCredentialSavedStore => ({
  save: async (credential) => {
    await blueskyStoredCredentialSaveQuery(db, credential);
    return RA.ok(undefined);
  },
});

export const createD1BlueskyStoredCredentialDeletedStore = (db: IoriD1Db): BlueskyStoredCredentialDeletedStore => ({
  delete: async () => {
    await blueskyStoredCredentialDeleteQuery(db);
    return RA.ok(undefined);
  },
});
