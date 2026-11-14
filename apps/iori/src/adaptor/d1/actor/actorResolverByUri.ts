import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { Actor, ActorResolverByUri } from '../../../domain/actor/actor.ts';
import { ActorId } from '../../../domain/actor/actorId.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { actorsTable, localActorsTable, remoteActorsTable, usersTable } from '../schema.ts';
import { toLocalActor } from './actorResolverByUserId.ts';
import { toRemoteActorProfileFields } from './remoteActorProfileColumns.ts';

export const createD1ActorResolverByUri = (db: IoriD1Db): ActorResolverByUri => ({
  resolve: (uri) =>
    RA.flow(
      fromD1(async (): Promise<Actor | undefined> => {
        const [row, ...rest] = await db.select()
          .from(actorsTable)
          .leftJoin(remoteActorsTable, eq(actorsTable.actorId, remoteActorsTable.actorId))
          .leftJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
          .leftJoin(usersTable, eq(localActorsTable.userId, usersTable.userId))
          .where(eq(actorsTable.uri, uri));
        if (row === undefined) return undefined;
        if (rest.length > 0) throw new Error(`Multiple actors found with the same uri: ${uri}`);
        if (row.remote_actors !== null) {
          return {
            id: ActorId.orThrow(row.actors.actorId),
            uri: row.actors.uri,
            inboxUrl: row.actors.inboxUrl,
            type: 'remote',
            url: row.remote_actors.url ?? undefined,
            username: row.remote_actors.username ?? undefined,
            logoUri: row.actors.logoUri ?? undefined,
            ...toRemoteActorProfileFields(row.remote_actors),
          };
        }
        if (row.local_actors !== null) {
          return toLocalActor(row.actors, row.local_actors, row.users);
        }
        throw new Error(`Actor type could not be determined for uri: ${uri}`);
      }),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
