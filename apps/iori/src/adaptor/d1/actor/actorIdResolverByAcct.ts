import { RA } from '@iwasa-kosui/result';
import { asc, eq } from 'drizzle-orm';

import type { ActorIdResolverByAcct } from '../../../domain/actor/accountRelationship.ts';
import { ActorId } from '../../../domain/actor/actorId.ts';
import type { IoriD1Db } from '../client.ts';
import { actorsTable, localActorsTable, remoteActorsTable, usersTable } from '../schema.ts';

const hostOf = (value: string): string | undefined => {
  try {
    return new URL(value).host;
  } catch {
    return undefined;
  }
};

export const createD1ActorIdResolverByAcct = (db: IoriD1Db): ActorIdResolverByAcct => ({
  resolve: async (lookup) => {
    if (lookup.type === 'local') {
      const [row] = await db.select({ actorId: localActorsTable.actorId }).from(usersTable)
        .innerJoin(localActorsTable, eq(usersTable.userId, localActorsTable.userId))
        .where(eq(usersTable.username, lookup.username))
        .limit(1);
      return RA.ok(row === undefined ? undefined : ActorId.orThrow(row.actorId));
    }
    const rows = await db.select({ actorId: actorsTable.actorId, uri: actorsTable.uri, url: remoteActorsTable.url })
      .from(remoteActorsTable)
      .innerJoin(actorsTable, eq(remoteActorsTable.actorId, actorsTable.actorId))
      .where(eq(remoteActorsTable.username, lookup.username))
      .orderBy(asc(actorsTable.actorId));
    const match = rows.find((row) => hostOf(row.url ?? row.uri) === lookup.host);
    return RA.ok(match === undefined ? undefined : ActorId.orThrow(match.actorId));
  },
});
