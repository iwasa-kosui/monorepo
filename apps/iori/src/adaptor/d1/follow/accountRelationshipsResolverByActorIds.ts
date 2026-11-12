import { RA } from '@iwasa-kosui/result';
import { inArray, sql } from 'drizzle-orm';

import type { AccountRelationshipsResolverByActorIds } from '../../../domain/actor/accountRelationship.ts';
import { ActorId } from '../../../domain/actor/actorId.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { actorsTable } from '../schema.ts';

export const createD1AccountRelationshipsResolverByActorIds = (
  db: IoriD1Db,
): AccountRelationshipsResolverByActorIds => ({
  resolve: async ({ viewerActorId, viewerUserId, actorIds }) => {
    if (actorIds.length === 0) return RA.ok([]);
    const rows = await db.select({
      actorId: actorsTable.actorId,
      following: sql<number>`exists (
        select 1 from follows where follows.followerId = ${viewerActorId} and follows.followingId = ${actorsTable.actorId}
      )`,
      followedBy: sql<number>`exists (
        select 1 from follows where follows.followerId = ${actorsTable.actorId} and follows.followingId = ${viewerActorId}
      )`,
      muting: sql<number>`exists (
        select 1 from mutes where mutes.userId = ${viewerUserId} and mutes.mutedActorId = ${actorsTable.actorId}
      )`,
      blocking: sql<number>`exists (
        select 1 from blocks where blocks.userId = ${viewerUserId} and blocks.blockedActorId = ${actorsTable.actorId}
      )`,
    }).from(actorsTable)
      .where(inArray(actorsTable.actorId, sql`(select value from json_each(${idsJson(actorIds)}))`));
    return RA.ok(rows.map((row) => ({
      actorId: ActorId.orThrow(row.actorId),
      following: Boolean(row.following),
      followedBy: Boolean(row.followedBy),
      muting: Boolean(row.muting),
      blocking: Boolean(row.blocking),
    })));
  },
});
