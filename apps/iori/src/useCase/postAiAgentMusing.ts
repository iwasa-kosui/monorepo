import { RA, type Result } from '@iwasa-kosui/result';

import { AiAgentBot } from '../domain/aiAgentBot/aiAgentBot.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { PostId } from '../domain/post/postId.ts';
import type { AgentChatModel } from '../ports/agentChatModel.ts';
import type { AiError } from '../ports/aiError.ts';
import { runAgentLoop } from './aiAgent/agentLoop.ts';
import {
  type AiAgentBotCapabilities,
  createAgentTools,
  formatPosts,
  MAX_OWN_RECENT_POSTS,
  MAX_RECENT_TIMELINE,
} from './aiAgent/agentTools.ts';
import {
  AI_AGENT_BOT_MAX_OUTPUT_TOKENS,
  AI_AGENT_BOT_MAX_STEPS,
  AI_AGENT_BOT_MODEL,
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
  | Readonly<{ posted: true; postId: PostId }>
  | Readonly<{ posted: false; reason: 'nothingToSay' | 'repeated' }>;

export type PostAiAgentMusingError = AiError | Readonly<{ type: 'AiAgentBotPostError'; message: string }>;

export type PostAiAgentMusingUseCase = UseCase<Input, PostAiAgentMusingResult, PostAiAgentMusingError>;

type Deps = Readonly<{
  chatModel: AgentChatModel;
  now: () => Instant;
}>;

/**
 * AI エージェントの bot が、タイムラインを読んで自分から 1 件投稿する。
 * 自分の最近の投稿の繰り返しになったときは投稿しない。
 */
const create = (deps: Deps): PostAiAgentMusingUseCase => {
  const agent = runAgentLoop(deps.chatModel);
  return {
    run: async ({ capabilities, poster }) => {
      const [timeline, ownPosts] = await Promise.all([
        capabilities.readRecentTimeline(MAX_RECENT_TIMELINE),
        capabilities.readOwnRecentPosts(MAX_OWN_RECENT_POSTS),
      ]);
      const ownPostIds = new Set(ownPosts.map((post) => post.postId));
      // 自分の投稿をタイムラインに混ぜると、モデルがそれを話題に選んでなぞりやすい。分けて見せる
      const othersPosts = timeline.filter((post) => !ownPostIds.has(post.postId));
      const result = await agent({
        model: AI_AGENT_BOT_MODEL,
        system: musingSystemPrompt(),
        input: musingUserPrompt({
          timeline: formatPosts(othersPosts),
          ownPosts: formatPosts(ownPosts),
          now: new Date(deps.now()).toISOString(),
        }),
        tools: createAgentTools(capabilities),
        maxSteps: AI_AGENT_BOT_MAX_STEPS,
        maxOutputTokens: AI_AGENT_BOT_MAX_OUTPUT_TOKENS,
      });
      if (!result.ok) return result;
      const text = result.val.answer === undefined ? undefined : AiAgentBot.normalizeAnswer(result.val.answer);
      if (text === undefined) return RA.ok({ posted: false, reason: 'nothingToSay' });
      if (AiAgentBot.isRepeatOf(text, ownPosts.map((post) => post.text))) {
        return RA.ok({ posted: false, reason: 'repeated' });
      }
      const posted = await poster.post(text);
      if (!posted.ok) return RA.err({ type: 'AiAgentBotPostError', message: posted.err });
      return RA.ok({ posted: true, postId: posted.val });
    },
  };
};

export const PostAiAgentMusingUseCase = { create } as const;
