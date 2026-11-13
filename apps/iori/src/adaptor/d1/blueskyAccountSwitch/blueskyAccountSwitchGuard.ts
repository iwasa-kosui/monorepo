import { and, eq, exists, ne, notExists, sql } from 'drizzle-orm';

import { BLUESKY_CREDENTIAL_ID } from '../blueskyCredential/blueskyCredentialStore.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyAccountSwitchTable, blueskyCredentialsTable } from '../schema.ts';

export const blueskyAccountSwitchAbsent = (db: IoriD1Db) =>
  notExists(db.select({ n: sql`1` }).from(blueskyAccountSwitchTable));

export const blueskyAccountSwitchStarted = (db: IoriD1Db, switchId: string) =>
  exists(
    db.select({ n: sql`1` }).from(blueskyAccountSwitchTable).where(eq(blueskyAccountSwitchTable.switchId, switchId)),
  );

export const blueskyCredentialUnchangedFrom = (db: IoriD1Db, fromDid: string) =>
  notExists(
    db.select({ n: sql`1` }).from(blueskyCredentialsTable)
      .where(and(eq(blueskyCredentialsTable.id, BLUESKY_CREDENTIAL_ID), ne(blueskyCredentialsTable.did, fromDid))),
  );
