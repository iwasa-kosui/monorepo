import { describe, expect, it } from 'vitest';

import { ActorId } from '../../actor/actorId.ts';
import { Instant } from '../../instant/instant.ts';
import {
  AiAgentBotMemory,
  AiAgentBotMemoryId,
  type AiAgentBotMemorySubject,
  MAX_MEMORIES_PER_ACTOR,
  MAX_MEMORY_CHARACTERS,
  MAX_SELF_MEMORIES,
} from '../aiAgentBotMemory.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 15));
const ALICE: AiAgentBotMemorySubject = { type: 'actor', actorId: ActorId.generate() };
const SELF: AiAgentBotMemorySubject = { type: 'self' };

const memory = (subject: AiAgentBotMemorySubject, content: string, updatedAt: number): AiAgentBotMemory => ({
  memoryId: AiAgentBotMemoryId.generate(),
  subject,
  content,
  createdAt: Instant.orThrow(updatedAt),
  updatedAt: Instant.orThrow(updatedAt),
});

const remember = (subject: AiAgentBotMemorySubject, content: string, existing: readonly AiAgentBotMemory[] = []) => {
  const result = AiAgentBotMemory.remember({ subject, content, existing, now: NOW });
  if (!result.ok) throw new Error(result.err.type);
  return result.val;
};

describe('AiAgentBotMemory.remember', () => {
  it('空白だけの内容は記憶しない', () => {
    expect(AiAgentBotMemory.remember({ subject: SELF, content: ' \n ', existing: [], now: NOW }))
      .toEqual({ ok: false, err: { type: 'emptyContent' } });
  });

  it('改行をまとめ、上限を超えた分は切り詰める', () => {
    expect(remember(SELF, '一行目\n\n二行目').saved.content).toBe('一行目 二行目');
    const long = remember(SELF, 'あ'.repeat(MAX_MEMORY_CHARACTERS + 10)).saved.content;
    expect([...long]).toHaveLength(MAX_MEMORY_CHARACTERS);
    expect(long.endsWith('…')).toBe(true);
  });

  it('同じ相手に似た記憶があれば、増やさずにその記憶を書き換える', () => {
    const old = memory(ALICE, 'Rust の非同期処理に関心がある', 1);
    const result = remember(ALICE, 'Rust の非同期処理に関心がある。', [old]);
    expect(result.replaced).toBe(true);
    expect(result.saved).toEqual({ ...old, content: 'Rust の非同期処理に関心がある。', updatedAt: NOW });
    expect(result.evicted).toEqual([]);
  });

  it('ほかの相手の似た記憶は書き換えない', () => {
    const bobs = memory({ type: 'actor', actorId: ActorId.generate() }, 'Rust の非同期処理に関心がある', 1);
    const result = remember(ALICE, 'Rust の非同期処理に関心がある', [bobs]);
    expect(result.replaced).toBe(false);
    expect(result.saved.memoryId).not.toBe(bobs.memoryId);
  });

  it('相手についての記憶が上限を超えるときは、いちばん長く更新していない記憶を忘れる', () => {
    const existing = Array.from(
      { length: MAX_MEMORIES_PER_ACTOR },
      (_, i) => memory(ALICE, `話題その${i}について話した。番号は ${i * 7919}`, 1000 - i),
    );
    const result = remember(ALICE, 'まったく新しいこと', existing);
    expect(result.evicted).toEqual([existing.at(-1)]);
  });

  it('上限は対象ごとに数える', () => {
    const others = Array.from(
      { length: MAX_SELF_MEMORIES },
      (_, i) => memory({ type: 'actor', actorId: ActorId.generate() }, `記憶 ${i * 104729}`, i),
    );
    expect(remember(SELF, '自分のこと', others).evicted).toEqual([]);
  });
});
