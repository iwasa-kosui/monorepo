import { and, eq, exists, ne, notExists, sql } from 'drizzle-orm';

import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyAccountSwitchTable, blueskyCredentialsTable } from '../schema.ts';

export const blueskyAccountSwitchAbsent = (db: IoriD1Db, userId: UserId) =>
  notExists(db.select({ n: sql`1` }).from(blueskyAccountSwitchTable).where(eq(blueskyAccountSwitchTable.userId, userId)));

export const blueskyAccountSwitchStarted = (db: IoriD1Db, switchId: string) =>
  exists(
    db.select({ n: sql`1` }).from(blueskyAccountSwitchTable).where(eq(blueskyAccountSwitchTable.switchId, switchId)),
  );

export const blueskyCredentialUnchangedFrom = (db: IoriD1Db, userId: UserId, fromDid: string) =>
  notExists(
    db.select({ n: sql`1` }).from(blueskyCredentialsTable)
      .where(and(eq(blueskyCredentialsTable.userId, userId), ne(blueskyCredentialsTable.did, fromDid))),
  );
