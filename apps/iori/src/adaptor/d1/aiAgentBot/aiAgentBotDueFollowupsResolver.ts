import { RA } from '@iwasa-kosui/result';
import { and, asc, count, isNull, lte } from 'drizzle-orm';

import { ActorId } from '../../../domain/actor/actorId.ts';
import {
  type AiAgentBotDueFollowupsResolver,
  AiAgentBotFollowupId,
  type AiAgentBotPendingFollowupsCountResolver,
} from '../../../domain/aiAgentBot/aiAgentBotFollowup.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { IoriD1Db } from '../client.ts';
import { aiAgentBotFollowupsTable } from '../schema.ts';

export const createD1AiAgentBotDueFollowupsResolver = (db: IoriD1Db): AiAgentBotDueFollowupsResolver => ({
  resolve: async ({ now, limit }) => {
    if (limit <= 0) return RA.ok([]);
    const rows = await db.select().from(aiAgentBotFollowupsTable)
      .where(and(isNull(aiAgentBotFollowupsTable.claimedAt), lte(aiAgentBotFollowupsTable.dueAt, new Date(now))))
      .orderBy(asc(aiAgentBotFollowupsTable.dueAt))
      .limit(limit);
    return RA.ok(rows.map((row) => ({
      followupId: AiAgentBotFollowupId.orThrow(row.followupId),
      postId: PostId.orThrow(row.postId),
      authorActorId: ActorId.orThrow(row.authorActorId),
      note: row.note,
      round: row.round,
      dueAt: Instant.orThrow(row.dueAt.getTime()),
      scheduledAt: Instant.orThrow(row.scheduledAt.getTime()),
    })));
  },
});

export const createD1AiAgentBotPendingFollowupsCountResolver = (
  db: IoriD1Db,
): AiAgentBotPendingFollowupsCountResolver => ({
  resolve: async () => {
    const [row] = await db.select({ n: count() }).from(aiAgentBotFollowupsTable)
      .where(isNull(aiAgentBotFollowupsTable.handledAt));
    return RA.ok(row?.n ?? 0);
  },
});
