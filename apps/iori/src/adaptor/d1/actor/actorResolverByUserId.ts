import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { ActorResolverByUserId } from '../../../domain/actor/actor.ts';
import { ActorId } from '../../../domain/actor/actorId.ts';
import type { LocalActor } from '../../../domain/actor/localActor.ts';
import { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { actorsTable, localActorsTable } from '../schema.ts';

export const toLocalActor = (
  actor: typeof actorsTable.$inferSelect,
  localActor: typeof localActorsTable.$inferSelect,
): LocalActor => ({
  id: ActorId.orThrow(actor.actorId),
  uri: actor.uri,
  inboxUrl: actor.inboxUrl,
  type: 'local',
  userId: UserId.orThrow(localActor.userId),
  logoUri: actor.logoUri ?? undefined,
  displayName: localActor.displayName ?? undefined,
  bio: localActor.bio ?? undefined,
});

export const createD1ActorResolverByUserId = (db: IoriD1Db): ActorResolverByUserId => ({
  resolve: async (userId) => {
    const [row, ...rest] = await db.select()
      .from(actorsTable)
      .leftJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
      .where(eq(localActorsTable.userId, userId));
    if (row === undefined) {
      return RA.ok(undefined);
    }
    if (rest.length > 0) {
      throw new Error(`Multiple actors found with the same userId: ${userId}`);
    }
    if (row.local_actors === null) {
      throw new Error(`Actor type could not be determined for userId: ${userId}`);
    }
    return RA.ok(toLocalActor(row.actors, row.local_actors));
  },
});
