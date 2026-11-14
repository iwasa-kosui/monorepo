import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { ActorResolverByUserId } from '../../../domain/actor/actor.ts';
import { ActorId } from '../../../domain/actor/actorId.ts';
import type { LocalActor } from '../../../domain/actor/localActor.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { Username } from '../../../domain/user/username.ts';
import type { IoriD1Db } from '../client.ts';
import { actorsTable, localActorsTable, usersTable } from '../schema.ts';

type ActorRow = Pick<typeof actorsTable.$inferSelect, 'actorId' | 'uri' | 'inboxUrl' | 'logoUri'>;
type LocalActorRow = Pick<typeof localActorsTable.$inferSelect, 'userId' | 'displayName' | 'bio'>;
type UserRow = Pick<typeof usersTable.$inferSelect, 'username'>;

/**
 * local_actors と users を結合した行から LocalActor を作る。
 * ユーザー名は users が持つので、LocalActor を読むクエリは users も結合する。
 */
export const toLocalActor = (
  actor: ActorRow,
  localActor: LocalActorRow,
  user: UserRow | null,
): LocalActor => {
  if (user === null) {
    throw new Error(`User not found for local actor: ${actor.actorId}`);
  }
  return {
    id: ActorId.orThrow(actor.actorId),
    uri: actor.uri,
    inboxUrl: actor.inboxUrl,
    type: 'local',
    userId: UserId.orThrow(localActor.userId),
    username: Username.orThrow(user.username),
    logoUri: actor.logoUri ?? undefined,
    displayName: localActor.displayName ?? undefined,
    bio: localActor.bio ?? undefined,
  };
};

export const createD1ActorResolverByUserId = (db: IoriD1Db): ActorResolverByUserId => ({
  resolve: async (userId) => {
    const [row, ...rest] = await db.select()
      .from(actorsTable)
      .leftJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
      .leftJoin(usersTable, eq(localActorsTable.userId, usersTable.userId))
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
    return RA.ok(toLocalActor(row.actors, row.local_actors, row.users));
  },
});
