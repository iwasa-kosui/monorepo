import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { Actor, ActorsResolverByFollowingId } from '../../../domain/actor/actor.ts';
import { ActorId } from '../../../domain/actor/actorId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { actorsTable, followsTable, localActorsTable, remoteActorsTable } from '../schema.ts';

const toActor = (row: {
  actors: { actorId: string; uri: string; inboxUrl: string; logoUri: string | null };
  local_actors: { userId: string } | null;
  remote_actors: { url: string | null; username: string | null } | null;
}): Actor => {
  if (row.remote_actors !== null) {
    return {
      id: ActorId.orThrow(row.actors.actorId),
      uri: row.actors.uri,
      inboxUrl: row.actors.inboxUrl,
      type: 'remote',
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
      type: 'local',
      userId: UserId.orThrow(row.local_actors.userId),
      logoUri: row.actors.logoUri ?? undefined,
    };
  }
  throw new Error(`Actor type could not be determined for actorId: ${row.actors.actorId}`);
};

export const createD1ActorsResolverByFollowingId = (db: IoriD1Db): ActorsResolverByFollowingId => ({
  resolve: async (followingId) => {
    const rows = await db.select()
      .from(actorsTable)
      .leftJoin(followsTable, eq(actorsTable.actorId, followsTable.followerId))
      .leftJoin(remoteActorsTable, eq(actorsTable.actorId, remoteActorsTable.actorId))
      .leftJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
      .where(eq(followsTable.followingId, followingId));
    return RA.ok(rows.map(toActor));
  },
});
