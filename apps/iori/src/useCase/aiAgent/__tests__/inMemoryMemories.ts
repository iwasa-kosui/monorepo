import { RA } from '@iwasa-kosui/result';

import type { AiAgentBotMemory } from '../../../domain/aiAgentBot/aiAgentBotMemory.ts';
import type { Instant } from '../../../domain/instant/instant.ts';
import type { AgentMemoryDeps } from '../memoryTools.ts';

/** bot の記憶をメモリに保存する。テストで、記憶の読み書きを観察するのに使う */
export const createInMemoryMemories = (now: () => Instant, initial: readonly AiAgentBotMemory[] = []) => {
  const memories = new Map(initial.map((memory) => [memory.memoryId, memory]));
  const deps: AgentMemoryDeps = {
    memoriesResolverBySubject: {
      resolve: ({ subject, limit }) =>
        RA.ok(
          [...memories.values()]
            .filter((memory) =>
              subject.type === 'self'
                ? memory.subject.type === 'self'
                : memory.subject.type === 'actor' && memory.subject.actorId === subject.actorId
            )
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, limit),
        ),
    },
    memoryChangedStore: {
      store: (...changes) => {
        for (const change of changes) {
          if (change.type === 'saved') memories.set(change.memory.memoryId, change.memory);
          else memories.delete(change.memoryId);
        }
        return RA.ok(undefined);
      },
    },
    now,
  };
  return { deps, memories: () => [...memories.values()] };
};
