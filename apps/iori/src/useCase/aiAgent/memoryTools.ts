import z from 'zod/v4';

import type { ActorId } from '../../domain/actor/actorId.ts';
import {
  type AiAgentBotMemoriesResolverBySubject,
  AiAgentBotMemory,
  type AiAgentBotMemoryChange,
  type AiAgentBotMemoryChangedStore,
  type AiAgentBotMemorySubject,
  MAX_MEMORIES_PER_ACTOR,
  MAX_MEMORY_CHARACTERS,
  MAX_MEMORY_WRITES_PER_RUN,
  MAX_SELF_MEMORIES,
} from '../../domain/aiAgentBot/aiAgentBotMemory.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import type { AgentTool } from './agentLoop.ts';

export type AgentMemoryDeps = Readonly<{
  memoriesResolverBySubject: AiAgentBotMemoriesResolverBySubject;
  memoryChangedStore: AiAgentBotMemoryChangedStore;
  now: () => Instant;
}>;

/** 1 回の実行で bot が読む記憶と、記憶を書き換えるツール */
export type AgentMemory = Readonly<{
  /** プロンプトに載せる、いまの記憶 */
  section: string;
  tools: readonly AgentTool[];
}>;

const SELF_HEADING = '## あなたの記憶（自分について）';

const formatMemories = (memories: readonly AiAgentBotMemory[]): string =>
  memories.length === 0
    ? 'まだありません。'
    : memories.map((memory) =>
      `- [memoryId: ${memory.memoryId}] ${memory.content}（${
        new Date(memory.updatedAt).toISOString().slice(0, 10)
      } に更新）`
    ).join('\n');

const rememberArgs = z.object({ content: z.string(), about: z.string().optional() });
const forgetArgs = z.object({ memoryId: z.string() });

/**
 * bot の記憶を読み、記憶を書き換えるツールを用意する。
 * 自分についての記憶はいつも読む。相手についての記憶は、その相手と話すとき（author を渡したとき）だけ読み書きする。
 * ほかの人についての記憶を、別の人との会話に持ち出さないようにするため。
 * forget で忘れられるのは、この実行で読んだ記憶（と、この実行で覚えた記憶）だけにする。
 */
export const loadAgentMemory = async (
  deps: AgentMemoryDeps,
  input: Readonly<{ author?: Readonly<{ actorId: ActorId; handle: string }> }>,
): Promise<AgentMemory> => {
  const selfSubject: AiAgentBotMemorySubject = { type: 'self' };
  const authorSubject: AiAgentBotMemorySubject | undefined = input.author === undefined
    ? undefined
    : { type: 'actor', actorId: input.author.actorId };

  const [selfMemories, authorMemories] = await Promise.all([
    deps.memoriesResolverBySubject.resolve({ subject: selfSubject, limit: MAX_SELF_MEMORIES }),
    authorSubject === undefined
      ? Promise.resolve(undefined)
      : deps.memoriesResolverBySubject.resolve({ subject: authorSubject, limit: MAX_MEMORIES_PER_ACTOR }),
  ]);
  /** この実行の中での記憶。覚えたり忘れたりするたびに書き換え、上限の判定と forget の確認に使う */
  let memories: AiAgentBotMemory[] = [...selfMemories.val, ...(authorMemories?.val ?? [])];
  let writes = 0;

  const section = [
    SELF_HEADING,
    formatMemories(selfMemories.val),
    ...(input.author === undefined || authorMemories === undefined
      ? []
      : ['', `## あなたの記憶（${input.author.handle} について）`, formatMemories(authorMemories.val)]),
  ].join('\n');

  const apply = async (changes: readonly AiAgentBotMemoryChange[]) => {
    await deps.memoryChangedStore.store(...changes);
    for (const change of changes) {
      memories = memories.filter((memory) =>
        memory.memoryId !== (change.type === 'saved' ? change.memory.memoryId : change.memoryId)
      );
      if (change.type === 'saved') memories.push(change.memory);
    }
    writes++;
  };

  const aboutDescription = authorSubject === undefined
    ? '"self"（あなた自身について）'
    : `"author"（いま話している ${input.author?.handle} について）か "self"（あなた自身について）`;

  const remember: AgentTool = {
    name: 'remember',
    description: [
      '次の実行でも覚えておきたいことを、短いメモとして記憶する。',
      '相手が教えてくれた関心・好み・呼んでほしい名前や、あなたが書いたこと・決めた方針など、次の会話や投稿に役立つことだけを残す。',
      '同じ対象に似た記憶があれば、それを書き換える。上限を超えたら、いちばん長く更新していない記憶を忘れる。',
    ].join(''),
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: `記憶する内容（${MAX_MEMORY_CHARACTERS} 文字以内の平文）` },
        about: { type: 'string', description: `何についての記憶か。${aboutDescription}` },
      },
      required: ['content'],
    },
    run: async (args) => {
      const parsed = rememberArgs.safeParse(args);
      if (!parsed.success) return 'エラー: remember の引数が正しくありません。';
      if (writes >= MAX_MEMORY_WRITES_PER_RUN) return 'エラー: この実行で記憶を書き換えられる回数の上限に達しました。';
      const about = parsed.data.about?.trim() ?? (authorSubject === undefined ? 'self' : 'author');
      const subject = about === 'self' ? selfSubject : about === 'author' ? authorSubject : undefined;
      if (subject === undefined) return `エラー: about には ${aboutDescription} を指定してください。`;
      const remembered = AiAgentBotMemory.remember({
        subject,
        content: parsed.data.content,
        existing: memories,
        now: deps.now(),
      });
      if (!remembered.ok) return 'エラー: 記憶する内容が空です。';
      const { saved, replaced, evicted } = remembered.val;
      await apply([
        ...evicted.map((memory): AiAgentBotMemoryChange => ({ type: 'forgotten', memoryId: memory.memoryId })),
        { type: 'saved', memory: saved },
      ]);
      return [
        replaced
          ? `似た記憶 [memoryId: ${saved.memoryId}] を書き換えました。`
          : `記憶しました [memoryId: ${saved.memoryId}]。`,
        ...evicted.map((memory) => `上限を超えたので「${memory.content}」を忘れました。`),
      ].join('\n');
    },
  };

  const forget: AgentTool = {
    name: 'forget',
    description: [
      'memoryId を指定して、記憶を忘れる。',
      '記憶が誤っていたり古くなったりしたときや、相手に忘れてほしいと頼まれたときに使う。',
    ].join(''),
    parameters: {
      type: 'object',
      properties: { memoryId: { type: 'string', description: '「あなたの記憶」に書かれた memoryId' } },
      required: ['memoryId'],
    },
    run: async (args) => {
      const parsed = forgetArgs.safeParse(args);
      if (!parsed.success) return 'エラー: forget の引数が正しくありません。';
      if (writes >= MAX_MEMORY_WRITES_PER_RUN) return 'エラー: この実行で記憶を書き換えられる回数の上限に達しました。';
      const target = memories.find((memory) => memory.memoryId === parsed.data.memoryId.trim());
      if (target === undefined) {
        return 'エラー: その memoryId の記憶はありません。「あなたの記憶」の memoryId を渡してください。';
      }
      await apply([{ type: 'forgotten', memoryId: target.memoryId }]);
      return `「${target.content}」を忘れました。`;
    },
  };

  return { section, tools: [remember, forget] };
};
