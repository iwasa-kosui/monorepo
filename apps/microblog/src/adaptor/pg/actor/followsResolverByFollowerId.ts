import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { Actor } from '../../../domain/actor/actor.ts';
import { ActorId } from '../../../domain/actor/actorId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { actorsTable, followsTable, localActorsTable, remoteActorsTable } from '../schema.ts';

const getInstance = singleton(() => ({
  resolve: async (followerId: ActorId): RA<Actor[], never> => {
    const rows = await DB.getInstance().select().from(actorsTable)
      .leftJoin(followsTable, eq(actorsTable.actorId, followsTable.followingId))
      .leftJoin(
        remoteActorsTable,
        eq(actorsTable.actorId, remoteActorsTable.actorId),
      )
      .leftJoin(
        localActorsTable,
        eq(actorsTable.actorId, localActorsTable.actorId),
      )
      .where(
        eq(followsTable.followerId, followerId),
      ).execute();

    return RA.ok(rows.map(row => {
      if (row.remote_actors) {
        const actor: Actor = {
          id: ActorId.orThrow(row.actors.actorId),
          uri: row.actors.uri,
          inboxUrl: row.actors.inboxUrl,
          type: 'remote',
          url: row.remote_actors.url ?? undefined,
          username: row.remote_actors.username ?? undefined,
          logoUri: row.actors.logoUri ?? undefined,
        };
        return actor;
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
        return actor;
      }
      throw new Error(
        `Actor type could not be determined for actorId: ${row.actors.actorId}, type: ${row.actors.type}`,
      );
    }));
  },
}));

export const PgActorResolverByFollowerId = {
  getInstance,
} as const;
