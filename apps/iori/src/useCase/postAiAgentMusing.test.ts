import { RA, Result } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { Instant } from '../domain/instant/instant.ts';
import { PostId } from '../domain/post/postId.ts';
import type { AgentChatModel, AgentChatResponse } from '../ports/agentChatModel.ts';
import type { AiAgentBotCapabilities } from './aiAgent/agentTools.ts';
import { PostAiAgentMusingUseCase } from './postAiAgentMusing.ts';

const NOW = Instant.orThrow(1_800_000_000_000);

const capabilities: AiAgentBotCapabilities = {
  readPost: async () => undefined,
  readThread: async () => [],
  searchTimeline: async () => [],
  readRecentTimeline: async () => [],
  readOwnRecentPosts: async () => [],
  fetchUrl: async () => Result.err('unused'),
  likePost: async () => Result.ok(undefined),
  repostPost: async () => Result.ok(undefined),
  followAuthor: async () => Result.ok(undefined),
};

const scriptedModel = (responses: readonly AgentChatResponse[]): AgentChatModel => {
  let call = 0;
  return { chat: async () => RA.ok(responses[call++] ?? { content: undefined, toolCalls: [] }) };
};

const createPost = (text: string): AgentChatResponse => ({
  content: undefined,
  toolCalls: [{ id: 'call', name: 'create_post', arguments: { text } }],
});

const run = async (chatModel: AgentChatModel) => {
  const posted: string[] = [];
  const postId = PostId.generate();
  const result = await PostAiAgentMusingUseCase.create({ chatModel, now: () => NOW }).run({
    capabilities,
    poster: {
      post: async (text) => {
        posted.push(text);
        return Result.ok(postId);
      },
    },
  });
  return { result, posted, postId };
};

describe('PostAiAgentMusingUseCase', () => {
  it('create_post ツールで投稿する', async () => {
    const { result, posted, postId } = await run(scriptedModel([createPost('今日の発見')]));
    expect(posted).toEqual(['今日の発見']);
    expect(result).toEqual(Result.ok({ posted: true, postId }));
  });

  it('create_post は 1 回の実行で 1 回だけ使える', async () => {
    const { posted } = await run(scriptedModel([createPost('1 件目'), createPost('2 件目')]));
    expect(posted).toEqual(['1 件目']);
  });

  it('create_post を使わずに終えたら、投稿しない', async () => {
    const { result, posted } = await run(scriptedModel([{ content: '特に無し', toolCalls: [] }]));
    expect(posted).toEqual([]);
    expect(result).toEqual(Result.ok({ posted: false, reason: 'nothingToSay' }));
  });
});
