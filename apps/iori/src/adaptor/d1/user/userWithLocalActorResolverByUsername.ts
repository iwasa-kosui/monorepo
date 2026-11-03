import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { UserWithLocalActorResolverByUsername } from '../../../domain/user/user.ts';
import { toLocalActor } from '../actor/actorResolverByUserId.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { actorsTable, localActorsTable, usersTable } from '../schema.ts';
import { toUser } from './userResolver.ts';

export const createD1UserWithLocalActorResolverByUsername = (db: IoriD1Db): UserWithLocalActorResolverByUsername => ({
  resolve: (username) =>
    RA.flow(
      fromD1(async () => {
        const [row, ...rest] = await db.select()
          .from(usersTable)
          .leftJoin(localActorsTable, eq(localActorsTable.userId, usersTable.userId))
          .leftJoin(actorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
          .where(eq(usersTable.username, username));
        if (!row) {
          return undefined;
        }
        if (rest.some((other) => other.users.userId !== row.users.userId)) {
          throw new Error(`Multiple users found with the same username: ${username}`);
        }
        if (rest.length > 0) {
          throw new Error(`Multiple actors found with the same userId: ${row.users.userId}`);
        }
        return {
          user: toUser(row.users),
          actor: row.local_actors === null || row.actors === null
            ? undefined
            : toLocalActor(row.actors, row.local_actors),
        };
      }),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
