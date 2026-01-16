import { RA } from "@iwasa-kosui/result";
import { eq } from "drizzle-orm";

import type { ActorId } from "../../../domain/actor/actorId.ts";
import { singleton } from "../../../helper/singleton.ts";
import { DB } from "../db.ts";
import { likesTable } from "../schema.ts";

export type LikesResolverByActorId = {
  resolve: (actorId: ActorId) => RA<ReadonlySet<string>, never>;
};

const getInstance = singleton((): LikesResolverByActorId => ({
  resolve: async (actorId: ActorId) => {
    const rows = await DB.getInstance()
      .select({ objectUri: likesTable.objectUri })
      .from(likesTable)
      .where(eq(likesTable.actorId, actorId))
      .execute();
    return RA.ok(new Set(rows.map((row) => row.objectUri)));
  },
}));

export const PgLikesResolverByActorId = {
  getInstance,
} as const;
