import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { SessionWithUserAndActorResolver } from '../../../domain/session/session.ts';
import { toLocalActor } from '../actor/actorResolverByUserId.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { actorsTable, localActorsTable, sessionsTable, usersTable } from '../schema.ts';
import { toUser } from '../user/userResolver.ts';
import { toSession } from './sessionResolver.ts';

export const createD1SessionWithUserAndActorResolver = (db: IoriD1Db): SessionWithUserAndActorResolver => ({
  resolve: (sessionId) =>
    RA.flow(
      fromD1(async () => {
        const [row, ...rest] = await db.select()
          .from(sessionsTable)
          .leftJoin(usersTable, eq(usersTable.userId, sessionsTable.userId))
          .leftJoin(localActorsTable, eq(localActorsTable.userId, sessionsTable.userId))
          .leftJoin(actorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
          .where(eq(sessionsTable.sessionId, sessionId));
        if (!row) {
          return undefined;
        }
        if (rest.length > 0) {
          throw new Error(`Multiple sessions found with the same ID: ${sessionId}`);
        }
        return {
          session: toSession(row.sessions),
          user: row.users === null ? undefined : toUser(row.users),
          actor: row.local_actors === null || row.actors === null
            ? undefined
            : toLocalActor(row.actors, row.local_actors, row.users),
        };
      }),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
