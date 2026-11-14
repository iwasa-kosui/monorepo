import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { Actor, ActorResolverByUserId } from '../../../domain/actor/actor.ts';
import { ActorId } from '../../../domain/actor/actorId.ts';
import type { LocalActor } from '../../../domain/actor/localActor.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { Username } from '../../../domain/user/username.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { actorsTable, localActorsTable, usersTable } from '../schema.ts';

const getInstance = singleton((): ActorResolverByUserId => {
  const resolve = async (userId: UserId): RA<LocalActor | undefined, never> => {
    const db = DB.getInstance();
    const [row, ...rest] = await db
      .select()
      .from(actorsTable)
      .leftJoin(
        localActorsTable,
        eq(actorsTable.actorId, localActorsTable.actorId),
      )
      .leftJoin(usersTable, eq(localActorsTable.userId, usersTable.userId))
      .where(eq(localActorsTable.userId, userId));
    if (!row) {
      return RA.ok(undefined);
    }
    if (rest.length > 0) {
      throw new Error(
        `Multiple actors found with the same userId: ${userId}`,
      );
    }
    if (row.local_actors) {
      const actor: Actor = {
        id: ActorId.orThrow(row.actors.actorId),
        uri: row.actors.uri,
        inboxUrl: row.actors.inboxUrl,
        type: 'local',
        userId: UserId.orThrow(row.local_actors.userId),
        username: Username.orThrow(row.users?.username ?? ''),
        logoUri: row.actors.logoUri ?? undefined,
      };
      return RA.ok(actor);
    }
    throw new Error(`Actor type could not be determined for userId: ${userId}, type: ${row.actors.type}`);
  };
  return { resolve };
});

export const PgActorResolverByUserId = {
  getInstance,
} as const;
