import { RA, Result } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { AiAgentBot, MUSING_INTERVAL_MS } from '../domain/aiAgentBot/aiAgentBot.ts';
import { Instant } from '../domain/instant/instant.ts';
import { PostId } from '../domain/post/postId.ts';
import type { AgentChatModel, AgentChatRequest, AgentChatResponse } from '../ports/agentChatModel.ts';
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
  readPopularArticles: async () => [],
  readBlueskyTopics: async () => ({ trends: [], timelineTopics: [], recentPosts: [] }),
  readBlueskyTrendPosts: async () => undefined,
  likePost: async () => Result.ok(undefined),
  repostPost: async () => Result.ok(undefined),
  followAuthor: async () => Result.ok(undefined),
};

const scriptedModel = (
  responses: readonly AgentChatResponse[],
  requests: AgentChatRequest[] = [],
): AgentChatModel => {
  let call = 0;
  return {
    chat: async (request) => {
      requests.push(request);
      return RA.ok(responses[call++] ?? { content: undefined, toolCalls: [] });
    },
  };
};

const createPost = (text: string): AgentChatResponse => ({
  content: undefined,
  toolCalls: [{ id: 'call', name: 'create_post', arguments: { text } }],
});

const run = async (
  chatModel: AgentChatModel,
  options: Readonly<{ now?: Instant; capabilities?: Partial<AiAgentBotCapabilities> }> = {},
) => {
  const posted: string[] = [];
  const postId = PostId.generate();
  const result = await PostAiAgentMusingUseCase.create({ chatModel, now: () => options.now ?? NOW }).run({
    capabilities: { ...capabilities, ...options.capabilities },
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
    expect(result).toEqual(Result.ok({ posted: true, postId, theme: 'timeline' }));
  });

  it('create_post は 1 回の実行で 1 回だけ使える', async () => {
    const { posted } = await run(scriptedModel([createPost('1 件目'), createPost('2 件目')]));
    expect(posted).toEqual(['1 件目']);
  });

  it('create_post を使わずに終えたら、投稿しない', async () => {
    const { result, posted } = await run(scriptedModel([{ content: '特に無し', toolCalls: [] }]));
    expect(posted).toEqual([]);
    expect(result).toEqual(Result.ok({ posted: false, reason: 'nothingToSay', theme: 'timeline' }));
  });

  it('人気の記事の回では、よく読まれている記事をモデルに見せる', async () => {
    const article = { title: '設計の記事', url: 'https://example.com/a', bookmarkCount: 321, sourceTitle: 'Example' };
    const slot = [0, 1, 2].find((n) =>
      AiAgentBot.decideMusingTheme({
        now: Instant.orThrow(n * MUSING_INTERVAL_MS),
        hasPopularArticles: true,
        hasBlueskyTopics: false,
      }) === 'popularArticle'
    )!;
    const requests: AgentChatRequest[] = [];
    const { result } = await run(scriptedModel([createPost('紹介')], requests), {
      now: Instant.orThrow(slot * MUSING_INTERVAL_MS),
      capabilities: { readPopularArticles: async () => [article] },
    });
    expect(result.ok && result.val.theme).toBe('popularArticle');
    const userPrompt = requests[0]?.messages.find((message) => message.role === 'user')?.content ?? '';
    expect(userPrompt).toContain('https://example.com/a');
    expect(userPrompt).toContain('321');
  });

  it('Bluesky の話題の回では、Bluesky 全体の話題とタイムラインの話題をモデルに見せる', async () => {
    const slot = [0, 1, 2].find((n) =>
      AiAgentBot.decideMusingTheme({
        now: Instant.orThrow(n * MUSING_INTERVAL_MS),
        hasPopularArticles: false,
        hasBlueskyTopics: true,
      }) === 'blueskyTopic'
    )!;
    const requests: AgentChatRequest[] = [];
    const { result } = await run(scriptedModel([createPost('話題のまとめ')], requests), {
      now: Instant.orThrow(slot * MUSING_INTERVAL_MS),
      capabilities: {
        readBlueskyTopics: async () => ({
          trends: [{
            topic: 't1',
            displayName: '大規模な通信障害',
            description: null,
            postCount: 500,
            status: 'hot',
            category: 'news',
            feedUri: null,
          }],
          timelineTopics: [{ kind: 'hashtag', label: '#typescript', title: null, people: 3, posts: [] }],
          recentPosts: [],
        }),
      },
    });
    expect(result.ok && result.val.theme).toBe('blueskyTopic');
    const userPrompt = requests[0]?.messages.find((message) => message.role === 'user')?.content ?? '';
    expect(userPrompt).toContain('大規模な通信障害');
    expect(userPrompt).toContain('#typescript');
  });
});
