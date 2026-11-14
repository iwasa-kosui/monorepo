import { RA } from '@iwasa-kosui/result';
import { and, asc, eq, gte, ne, notExists, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import { ActorId } from '../../../domain/actor/actorId.ts';
import type {
  AiAgentBotFollowBackAttemptedStore,
  AiAgentBotFollowBackCandidatesResolver,
} from '../../../domain/aiAgentBot/aiAgentBotFollowBack.ts';
import type { IoriD1Db } from '../client.ts';
import { runBatch } from '../runBatch.ts';
import { aiAgentBotFollowBacksTable, followsTable } from '../schema.ts';

export const createD1AiAgentBotFollowBackCandidatesResolver = (
  db: IoriD1Db,
): AiAgentBotFollowBackCandidatesResolver => ({
  resolve: async ({ botActorId, retryBefore, limit }) => {
    const back = alias(followsTable, 'back');
    const rows = await db.select({ actorId: followsTable.followerId }).from(followsTable)
      .where(and(
        eq(followsTable.followingId, botActorId),
        ne(followsTable.followerId, botActorId),
        notExists(
          db.select({ one: sql`1` }).from(back)
            .where(and(eq(back.followerId, botActorId), eq(back.followingId, followsTable.followerId))),
        ),
        notExists(
          db.select({ one: sql`1` }).from(aiAgentBotFollowBacksTable)
            .where(and(
              eq(aiAgentBotFollowBacksTable.actorId, followsTable.followerId),
              gte(aiAgentBotFollowBacksTable.attemptedAt, new Date(retryBefore)),
            )),
        ),
      ))
      .orderBy(asc(sql`${followsTable}.rowid`))
      .limit(limit);
    return RA.ok(rows.flatMap((row) => {
      const actorId = ActorId.parse(row.actorId);
      return actorId.ok ? [actorId.val] : [];
    }));
  },
});

export const createD1AiAgentBotFollowBackAttemptedStore = (db: IoriD1Db): AiAgentBotFollowBackAttemptedStore => ({
  store: async (...attempted) => {
    await runBatch(
      db,
      attempted.map((entry) => {
        const attemptedAt = new Date(entry.attemptedAt);
        return db.insert(aiAgentBotFollowBacksTable).values({ actorId: entry.actorId, attemptedAt })
          .onConflictDoUpdate({ target: aiAgentBotFollowBacksTable.actorId, set: { attemptedAt } });
      }),
    );
    return RA.ok(undefined);
  },
});
