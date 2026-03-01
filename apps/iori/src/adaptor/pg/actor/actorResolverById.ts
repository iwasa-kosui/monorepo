import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { Actor } from '../../../domain/actor/actor.ts';
import { ActorId } from '../../../domain/actor/actorId.ts';
import type { RemoteActor } from '../../../domain/actor/remoteActor.ts';
import type { Agg } from '../../../domain/aggregate/index.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { actorsTable, localActorsTable, remoteActorsTable } from '../schema.ts';

export type ActorResolverById = Agg.Resolver<ActorId, Actor | undefined>;

const getInstance = singleton((): ActorResolverById => {
  const resolve = async (actorId: ActorId): RA<Actor | undefined, never> => {
    const db = DB.getInstance();
    const [row, ...rest] = await db
      .select()
      .from(actorsTable)
      .leftJoin(
        remoteActorsTable,
        eq(actorsTable.actorId, remoteActorsTable.actorId),
      )
      .leftJoin(
        localActorsTable,
        eq(actorsTable.actorId, localActorsTable.actorId),
      )
      .where(eq(actorsTable.actorId, actorId));
    if (!row) {
      return RA.ok(undefined);
    }
    if (rest.length > 0) {
      throw new Error(
        `Multiple actors found with the same actorId: ${actorId}`,
      );
    }
    if (row.remote_actors) {
      const actor: RemoteActor = {
        id: ActorId.orThrow(row.actors.actorId),
        uri: row.actors.uri,
        inboxUrl: row.actors.inboxUrl,
        type: 'remote',
        url: row.remote_actors.url ?? undefined,
        username: row.remote_actors.username ?? undefined,
        logoUri: row.actors.logoUri ?? undefined,
      };
      return RA.ok(actor);
    }
    if (row.local_actors) {
      const actor: Actor = {
        id: ActorId.orThrow(row.actors.actorId),
        uri: row.actors.uri,
        inboxUrl: row.actors.inboxUrl,
        type: 'local',
        userId: UserId.orThrow(row.local_actors.userId),
        logoUri: row.actors.logoUri ?? undefined,
      };
      return RA.ok(actor);
    }
    throw new Error(`Actor type could not be determined for actorId: ${actorId}, type: ${row.actors.type}`);
  };
  return { resolve };
});

export const PgActorResolverById = {
  getInstance,
} as const;
