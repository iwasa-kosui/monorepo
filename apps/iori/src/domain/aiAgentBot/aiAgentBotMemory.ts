import { type RA, Result } from '@iwasa-kosui/result';
import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import type { ActorId } from '../actor/actorId.ts';
import type { Instant } from '../instant/instant.ts';
import { AiAgentBot } from './aiAgentBot.ts';

const AiAgentBotMemoryIdSym = Symbol('AiAgentBotMemoryId');
const zodType = z.uuid().brand(AiAgentBotMemoryIdSym).describe('AiAgentBotMemoryId');
export type AiAgentBotMemoryId = z.output<typeof zodType>;

const idSchema = Schema.create<AiAgentBotMemoryId, string>(zodType);

export const AiAgentBotMemoryId = {
  ...idSchema,
  generate: (): AiAgentBotMemoryId => idSchema.orThrow(crypto.randomUUID()),
} as const;

/** 1 つの記憶に書ける文字数の上限 */
export const MAX_MEMORY_CHARACTERS = 200;

/** 1 人の相手について持てる記憶の数。超えたら、いちばん長く更新していない記憶から忘れる */
export const MAX_MEMORIES_PER_ACTOR = 20;

/** bot 自身について持てる記憶の数。超えたら、いちばん長く更新していない記憶から忘れる */
export const MAX_SELF_MEMORIES = 30;

/** 1 回の実行で、記憶したり忘れたりできる回数の上限。モデルが記憶を書き散らすのを防ぐ */
export const MAX_MEMORY_WRITES_PER_RUN = 3;

/**
 * 記憶の対象。
 * - self: bot 自身について（これまでに書いたこと、気づいたこと、自分で決めた方針など）
 * - actor: 話した相手について（相手が教えてくれた関心や好み、呼び方など）。その相手と話すときだけ読む
 */
export type AiAgentBotMemorySubject =
  | Readonly<{ type: 'self' }>
  | Readonly<{ type: 'actor'; actorId: ActorId }>;

/**
 * AI エージェントの bot が、実行をまたいで覚えておくメモ。
 * bot は実行が終わるとやりとりを忘れるので、次の会話や投稿に役立つことだけを短く残す。
 */
export type AiAgentBotMemory = Readonly<{
  memoryId: AiAgentBotMemoryId;
  subject: AiAgentBotMemorySubject;
  content: string;
  createdAt: Instant;
  updatedAt: Instant;
}>;

export type AiAgentBotMemoryRememberError = Readonly<{ type: 'emptyContent' }>;

/** 記憶を残した結果。似た記憶があれば書き換え、上限を超えたら古い記憶を忘れる */
export type AiAgentBotMemoryRemembered = Readonly<{
  saved: AiAgentBotMemory;
  /** 書き換えたなら true。新しく覚えたなら false */
  replaced: boolean;
  /** 上限を超えたので忘れた記憶 */
  evicted: readonly AiAgentBotMemory[];
}>;

const sameSubject = (a: AiAgentBotMemorySubject, b: AiAgentBotMemorySubject): boolean =>
  a.type === 'self' ? b.type === 'self' : b.type === 'actor' && a.actorId === b.actorId;

const limitOf = (subject: AiAgentBotMemorySubject): number =>
  subject.type === 'self' ? MAX_SELF_MEMORIES : MAX_MEMORIES_PER_ACTOR;

/** 記憶の本文を整える。改行や連続する空白を 1 つの空白にし、上限を超えた分は切り詰める */
const normalizeContent = (raw: string): string => {
  const chars = [...raw.replace(/\s+/g, ' ').trim()];
  return chars.length > MAX_MEMORY_CHARACTERS
    ? `${chars.slice(0, MAX_MEMORY_CHARACTERS - 1).join('')}…`
    : chars.join('');
};

/**
 * 記憶を残す。existing には同じ対象の、いまある記憶を渡す。
 * - 同じ対象に似た記憶があれば、新しく増やさずにその記憶を書き換える（同じことを何度も覚えないように）
 * - 新しく覚えて上限を超えるときは、いちばん長く更新していない記憶から忘れる
 */
const remember = (
  input: Readonly<{
    subject: AiAgentBotMemorySubject;
    content: string;
    existing: readonly AiAgentBotMemory[];
    now: Instant;
  }>,
): Result<AiAgentBotMemoryRemembered, AiAgentBotMemoryRememberError> => {
  const content = normalizeContent(input.content);
  if (content.length === 0) return Result.err({ type: 'emptyContent' });
  const existing = input.existing.filter((memory) => sameSubject(memory.subject, input.subject));

  const similar = existing.find((memory) => AiAgentBot.isRepeatOf(content, [memory.content]));
  if (similar !== undefined) {
    return Result.ok({ saved: { ...similar, content, updatedAt: input.now }, replaced: true, evicted: [] });
  }

  const overflow = existing.length + 1 - limitOf(input.subject);
  const evicted = overflow <= 0
    ? []
    : [...existing].sort((a, b) => a.updatedAt - b.updatedAt).slice(0, overflow);
  return Result.ok({
    saved: {
      memoryId: AiAgentBotMemoryId.generate(),
      subject: input.subject,
      content,
      createdAt: input.now,
      updatedAt: input.now,
    },
    replaced: false,
    evicted,
  });
};

export const AiAgentBotMemory = { remember } as const;

/** 記憶の変化。覚えた（書き換えた）か、忘れたか */
export type AiAgentBotMemoryChange =
  | Readonly<{ type: 'saved'; memory: AiAgentBotMemory }>
  | Readonly<{ type: 'forgotten'; memoryId: AiAgentBotMemoryId }>;

/** 記憶の変化を 1 つのトランザクションで保存する */
export type AiAgentBotMemoryChangedStore = Readonly<{
  store: (...changes: readonly AiAgentBotMemoryChange[]) => RA<void, never>;
}>;

/** 対象についての記憶を、新しく更新した順に返す */
export type AiAgentBotMemoriesResolverBySubject = Readonly<{
  resolve: (
    condition: Readonly<{ subject: AiAgentBotMemorySubject; limit: number }>,
  ) => RA<readonly AiAgentBotMemory[], never>;
}>;
