import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { Actor } from '../../../domain/actor/actor.ts';
import { ActorId } from '../../../domain/actor/actorId.ts';
import type { Agg } from '../../../domain/aggregate/index.ts';
import { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { actorsTable, localActorsTable, remoteActorsTable } from '../schema.ts';

export type ActorResolverById = Agg.Resolver<ActorId, Actor | undefined>;

export const createD1ActorResolverById = (db: IoriD1Db): ActorResolverById => ({
  resolve: (actorId) =>
    RA.flow(
      fromD1(async () => {
        const [row, ...rest] = await db.select()
          .from(actorsTable)
          .leftJoin(remoteActorsTable, eq(actorsTable.actorId, remoteActorsTable.actorId))
          .leftJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
          .where(eq(actorsTable.actorId, actorId));
        if (row === undefined) return undefined;
        if (rest.length > 0) throw new Error(`Multiple actors found with the same actorId: ${actorId}`);
        if (row.remote_actors !== null) {
          return {
            id: ActorId.orThrow(row.actors.actorId),
            uri: row.actors.uri,
            inboxUrl: row.actors.inboxUrl,
            type: 'remote' as const,
            url: row.remote_actors.url ?? undefined,
            username: row.remote_actors.username ?? undefined,
            logoUri: row.actors.logoUri ?? undefined,
          };
        }
        if (row.local_actors !== null) {
          return {
            id: ActorId.orThrow(row.actors.actorId),
            uri: row.actors.uri,
            inboxUrl: row.actors.inboxUrl,
            type: 'local' as const,
            userId: UserId.orThrow(row.local_actors.userId),
            logoUri: row.actors.logoUri ?? undefined,
          };
        }
        throw new Error(`Actor type could not be determined for actorId: ${actorId}`);
      }),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
