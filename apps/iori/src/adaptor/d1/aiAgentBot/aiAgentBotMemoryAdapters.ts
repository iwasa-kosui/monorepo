import { RA } from '@iwasa-kosui/result';
import { desc, eq, isNull } from 'drizzle-orm';

import { ActorId } from '../../../domain/actor/actorId.ts';
import {
  type AiAgentBotMemoriesResolverBySubject,
  type AiAgentBotMemoryChangedStore,
  AiAgentBotMemoryId,
  type AiAgentBotMemorySubject,
} from '../../../domain/aiAgentBot/aiAgentBotMemory.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { IoriD1Db } from '../client.ts';
import { runBatch } from '../runBatch.ts';
import { aiAgentBotMemoriesTable } from '../schema.ts';

const subjectActorIdOf = (subject: AiAgentBotMemorySubject): string | null =>
  subject.type === 'self' ? null : subject.actorId;

export const createD1AiAgentBotMemoryChangedStore = (db: IoriD1Db): AiAgentBotMemoryChangedStore => ({
  store: async (...changes) => {
    await runBatch(
      db,
      changes.map((change) => {
        if (change.type === 'forgotten') {
          return db.delete(aiAgentBotMemoriesTable).where(eq(aiAgentBotMemoriesTable.memoryId, change.memoryId));
        }
        const { memory } = change;
        return db.insert(aiAgentBotMemoriesTable).values({
          memoryId: memory.memoryId,
          subjectActorId: subjectActorIdOf(memory.subject),
          content: memory.content,
          createdAt: new Date(memory.createdAt),
          updatedAt: new Date(memory.updatedAt),
        }).onConflictDoUpdate({
          target: aiAgentBotMemoriesTable.memoryId,
          set: { content: memory.content, updatedAt: new Date(memory.updatedAt) },
        });
      }),
    );
    return RA.ok(undefined);
  },
});

export const createD1AiAgentBotMemoriesResolverBySubject = (db: IoriD1Db): AiAgentBotMemoriesResolverBySubject => ({
  resolve: async ({ subject, limit }) => {
    if (limit <= 0) return RA.ok([]);
    const actorId = subjectActorIdOf(subject);
    const rows = await db.select().from(aiAgentBotMemoriesTable)
      .where(
        actorId === null
          ? isNull(aiAgentBotMemoriesTable.subjectActorId)
          : eq(aiAgentBotMemoriesTable.subjectActorId, actorId),
      )
      .orderBy(desc(aiAgentBotMemoriesTable.updatedAt), desc(aiAgentBotMemoriesTable.memoryId))
      .limit(limit);
    return RA.ok(rows.map((row) => ({
      memoryId: AiAgentBotMemoryId.orThrow(row.memoryId),
      subject: row.subjectActorId === null
        ? { type: 'self' as const }
        : { type: 'actor' as const, actorId: ActorId.orThrow(row.subjectActorId) },
      content: row.content,
      createdAt: Instant.orThrow(row.createdAt.getTime()),
      updatedAt: Instant.orThrow(row.updatedAt.getTime()),
    })));
  },
});
