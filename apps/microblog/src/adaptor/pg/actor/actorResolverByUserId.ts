import { RA } from "@iwasa-kosui/result";
import { UserId } from "../../../domain/user/userId.ts";
import { singleton } from "../../../helper/singleton.ts";
import { actorsTable, localActorsTable, remoteActorsTable, usersTable } from "../schema.ts";
import { DB } from "../db.ts";
import { eq } from "drizzle-orm";
import type { Actor, ActorResolverByUri, ActorResolverByUserId } from "../../../domain/actor/actor.ts";
import { ActorId } from "../../../domain/actor/actorId.ts";
import type { LocalActor } from "../../../domain/actor/localActor.ts";

const getInstance = singleton((): ActorResolverByUserId => {
  const resolve = async (userId: UserId): RA<LocalActor | undefined, never> => {
    const db = DB.getInstance();
    const [row, ...rest] = await db
      .select()
      .from(actorsTable)
      .leftJoin(
        localActorsTable,
        eq(actorsTable.actorId, localActorsTable.actorId)
      )
      .where(eq(localActorsTable.userId, userId));
    if (!row) {
      return RA.ok(undefined);
    }
    if (rest.length > 0) {
      throw new Error(
        `Multiple actors found with the same userId: ${userId}`
      );
    }
    if (row.local_actors) {
      const actor: Actor = {
        id: ActorId.orThrow(row.actors.actorId),
        uri: row.actors.uri,
        inboxUrl: row.actors.inboxUrl,
        type: 'local',
        userId: UserId.orThrow(row.local_actors.userId),
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
