import { RA, Result } from '@iwasa-kosui/result';

import { AiAgentBot, type AiAgentBotMusingTheme } from '../domain/aiAgentBot/aiAgentBot.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { PostId } from '../domain/post/postId.ts';
import type { AgentChatModel } from '../ports/agentChatModel.ts';
import type { AiError } from '../ports/aiError.ts';
import { runAgentLoop } from './aiAgent/agentLoop.ts';
import {
  type AiAgentBotCapabilities,
  createAgentTools,
  createPublishTool,
  formatArticles,
  formatBlueskyTopics,
  formatPosts,
  MAX_OWN_RECENT_POSTS,
  MAX_RECENT_TIMELINE,
} from './aiAgent/agentTools.ts';
import {
  AI_AGENT_BOT_MAX_OUTPUT_TOKENS,
  AI_AGENT_BOT_MAX_STEPS,
  AI_AGENT_BOT_MODEL,
  AI_AGENT_BOT_REASONING_EFFORT,
  musingSystemPrompt,
  musingUserPrompt,
} from './aiAgent/aiAgentBotPrompts.ts';
import type { UseCase } from './useCase.ts';

/** bot として公開の投稿をする。runtime が CreatePostUseCase を包んで用意する */
export type AiAgentBotPoster = Readonly<{
  post: (text: string) => Promise<Result<PostId, string>>;
}>;

type Input = Readonly<{
  capabilities: AiAgentBotCapabilities;
  poster: AiAgentBotPoster;
}>;

export type PostAiAgentMusingResult =
  | Readonly<{ posted: true; postId: PostId; theme: AiAgentBotMusingTheme }>
  | Readonly<{ posted: false; reason: 'nothingToSay' | 'repeated'; theme: AiAgentBotMusingTheme }>;

/** 話題の材料として見せる記事の数 */
const MATERIAL_COUNT = 8;

export type PostAiAgentMusingError = AiError | Readonly<{ type: 'AiAgentBotPostError'; message: string }>;

export type PostAiAgentMusingUseCase = UseCase<Input, PostAiAgentMusingResult, PostAiAgentMusingError>;

type Deps = Readonly<{
  chatModel: AgentChatModel;
  now: () => Instant;
}>;

/**
 * AI エージェントの bot が、自分から 1 件投稿する。投稿はエージェントが create_post ツールで行う。
 * 話題は実行ごとに、最近よく読まれている記事・Bluesky でいま話題になっていること・タイムラインの順に入れ替える。
 * 自分の最近の投稿の繰り返しになる本文は投稿せず、モデルに書き直させる。
 */
const create = (deps: Deps): PostAiAgentMusingUseCase => {
  const agent = runAgentLoop(deps.chatModel);
  return {
    run: async ({ capabilities, poster }) => {
      const [timeline, ownPosts, popularArticles, blueskyTopics] = await Promise.all([
        capabilities.readRecentTimeline(MAX_RECENT_TIMELINE),
        capabilities.readOwnRecentPosts(MAX_OWN_RECENT_POSTS),
        capabilities.readPopularArticles(MATERIAL_COUNT),
        capabilities.readBlueskyTopics(),
      ]);
      const theme = AiAgentBot.decideMusingTheme({
        now: deps.now(),
        hasPopularArticles: popularArticles.length > 0,
        hasBlueskyTopics: blueskyTopics.trends.length > 0 || blueskyTopics.timelineTopics.length > 0
          || blueskyTopics.recentPosts.length > 0,
      });
      const ownPostIds = new Set(ownPosts.map((post) => post.postId));
      // 自分の投稿をタイムラインに混ぜると、モデルがそれを話題に選んでなぞりやすい。分けて見せる
      const othersPosts = timeline.filter((post) => !ownPostIds.has(post.postId));
      const ownTexts = ownPosts.map((post) => post.text);

      let postId: PostId | undefined;
      let repeated = false;
      const postErrors: string[] = [];
      const postTool = createPublishTool({
        name: 'create_post',
        description: '自分の投稿として公開する。投稿の本文だけを渡す。',
        limit: 1,
        done: '投稿しました。',
        publish: async (text) => {
          if (AiAgentBot.isRepeatOf(text, ownTexts)) {
            repeated = true;
            return Result.err('あなたの最近の投稿の繰り返しです。別のことを書くか、投稿せずに終えてください。');
          }
          const posted = await poster.post(text);
          if (!posted.ok) {
            postErrors.push(posted.err);
            return Result.err(posted.err);
          }
          postId = posted.val;
          return Result.ok(undefined);
        },
      });
      const result = await agent({
        model: AI_AGENT_BOT_MODEL,
        system: musingSystemPrompt(theme),
        input: musingUserPrompt({
          theme,
          timeline: formatPosts(othersPosts),
          popularArticles: formatArticles(popularArticles),
          blueskyTopics: formatBlueskyTopics(blueskyTopics, { recentPosts: true }),
          ownPosts: formatPosts(ownPosts),
          now: new Date(deps.now()).toISOString(),
        }),
        tools: [...createAgentTools(capabilities), postTool.tool],
        finalTools: [postTool.tool],
        maxSteps: AI_AGENT_BOT_MAX_STEPS,
        maxOutputTokens: AI_AGENT_BOT_MAX_OUTPUT_TOKENS,
        reasoningEffort: AI_AGENT_BOT_REASONING_EFFORT,
      });
      if (postId !== undefined) return RA.ok({ posted: true, postId, theme });
      if (!result.ok) return result;
      if (postErrors.length > 0) return RA.err({ type: 'AiAgentBotPostError', message: postErrors.join('; ') });
      return RA.ok({ posted: false, reason: repeated ? 'repeated' : 'nothingToSay', theme });
    },
  };
};

export const PostAiAgentMusingUseCase = { create } as const;
