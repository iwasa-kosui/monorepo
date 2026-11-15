import { describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import {
  type AiAgentBotMemory,
  AiAgentBotMemoryId,
  type AiAgentBotMemorySubject,
} from '../../../domain/aiAgentBot/aiAgentBotMemory.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import {
  createD1AiAgentBotMemoriesResolverBySubject,
  createD1AiAgentBotMemoryChangedStore,
} from '../aiAgentBot/aiAgentBotMemoryAdapters.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const NOW = Date.UTC(2026, 10, 15);
const ALICE: AiAgentBotMemorySubject = { type: 'actor', actorId: ActorId.generate() };
const BOB: AiAgentBotMemorySubject = { type: 'actor', actorId: ActorId.generate() };
const SELF: AiAgentBotMemorySubject = { type: 'self' };

const memory = (subject: AiAgentBotMemorySubject, content: string, minutes: number): AiAgentBotMemory => ({
  memoryId: AiAgentBotMemoryId.generate(),
  subject,
  content,
  createdAt: Instant.orThrow(NOW),
  updatedAt: Instant.orThrow(NOW + minutes * 60 * 1000),
});

const setup = () => {
  const { db } = createSqliteD1Fixture();
  return {
    store: createD1AiAgentBotMemoryChangedStore(db),
    resolver: createD1AiAgentBotMemoriesResolverBySubject(db),
  };
};

describe('AI エージェントの bot の記憶の D1 アダプタ', () => {
  it('対象ごとに、新しく更新した順に読み返す', async () => {
    const { store, resolver } = setup();
    const older = memory(ALICE, '古い', 1);
    const newer = memory(ALICE, '新しい', 2);
    const bobs = memory(BOB, 'bob のこと', 3);
    const selfs = memory(SELF, '自分のこと', 4);
    await store.store(...[older, newer, bobs, selfs].map((m) => ({ type: 'saved' as const, memory: m })));

    expect((await resolver.resolve({ subject: ALICE, limit: 10 })).val).toEqual([newer, older]);
    expect((await resolver.resolve({ subject: SELF, limit: 10 })).val).toEqual([selfs]);
    expect((await resolver.resolve({ subject: ALICE, limit: 1 })).val).toEqual([newer]);
  });

  it('同じ記憶を保存し直すと、内容と更新日時を書き換える', async () => {
    const { store, resolver } = setup();
    const original = memory(ALICE, '前の内容', 1);
    await store.store({ type: 'saved', memory: original });
    const updated = { ...original, content: '新しい内容', updatedAt: Instant.orThrow(NOW + 5 * 60 * 1000) };
    await store.store({ type: 'saved', memory: updated });

    expect((await resolver.resolve({ subject: ALICE, limit: 10 })).val).toEqual([updated]);
  });

  it('忘れた記憶は読み返さない。覚えると忘れるを 1 回でまとめて保存できる', async () => {
    const { store, resolver } = setup();
    const evicted = memory(ALICE, '忘れる', 1);
    await store.store({ type: 'saved', memory: evicted });
    const added = memory(ALICE, '覚える', 2);
    await store.store({ type: 'forgotten', memoryId: evicted.memoryId }, { type: 'saved', memory: added });

    expect((await resolver.resolve({ subject: ALICE, limit: 10 })).val).toEqual([added]);
  });
});
