import { RA } from '@iwasa-kosui/result';
import { and, eq, type SQL, sql } from 'drizzle-orm';

import {
  type BlueskyCredentialUserIdResolverByDid,
  BlueskyStoredCredential,
  type BlueskyStoredCredentialDeletedStore,
  type BlueskyStoredCredentialResolver,
  type BlueskyStoredCredentialSavedStore,
} from '../../../domain/blueskyCredential/blueskyCredential.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { guardedInsert } from '../guardedInsert.ts';
import { blueskyCredentialsTable } from '../schema.ts';

export const createD1BlueskyStoredCredentialResolver = (
  db: IoriD1Db,
  userId: UserId,
): BlueskyStoredCredentialResolver => ({
  resolve: async () => {
    const [row] = await db.select().from(blueskyCredentialsTable)
      .where(eq(blueskyCredentialsTable.userId, userId)).limit(1);
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
  userId: UserId,
  credential: BlueskyStoredCredential,
  guard: SQL = sql`true`,
) => {
  const values = {
    ...credential,
    verifiedAt: new Date(credential.verifiedAt),
    updatedAt: new Date(credential.updatedAt),
  };
  return guardedInsert(db, blueskyCredentialsTable, { userId, ...values }, guard)
    .onConflictDoUpdate({ target: blueskyCredentialsTable.userId, set: values });
};

export const blueskyStoredCredentialDeleteQuery = (db: IoriD1Db, userId: UserId, guard?: SQL) =>
  db.delete(blueskyCredentialsTable).where(and(eq(blueskyCredentialsTable.userId, userId), guard));

export const createD1BlueskyStoredCredentialSavedStore = (
  db: IoriD1Db,
  userId: UserId,
): BlueskyStoredCredentialSavedStore => ({
  save: async (credential) => {
    await blueskyStoredCredentialSaveQuery(db, userId, credential);
    return RA.ok(undefined);
  },
});

export const createD1BlueskyStoredCredentialDeletedStore = (
  db: IoriD1Db,
  userId: UserId,
): BlueskyStoredCredentialDeletedStore => ({
  delete: async () => {
    await blueskyStoredCredentialDeleteQuery(db, userId);
    return RA.ok(undefined);
  },
});

export const createD1BlueskyCredentialUserIdResolverByDid = (db: IoriD1Db): BlueskyCredentialUserIdResolverByDid => ({
  resolve: async (did) => {
    const [row] = await db.select({ userId: blueskyCredentialsTable.userId }).from(blueskyCredentialsTable)
      .where(eq(blueskyCredentialsTable.did, did)).limit(1);
    return RA.ok(row?.userId as UserId | undefined);
  },
});

/** Bluesky のアカウントをつないでいるユーザーの一覧。定期実行で、ユーザーごとに同期するのに使う */
export const createD1BlueskyLinkedUserIdsResolver = (db: IoriD1Db) => ({
  resolve: async (): Promise<readonly UserId[]> => {
    const rows = await db.select({ userId: blueskyCredentialsTable.userId }).from(blueskyCredentialsTable);
    return rows.map((row) => row.userId as UserId);
  },
});
