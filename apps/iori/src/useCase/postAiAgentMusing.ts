import { RA, Result } from '@iwasa-kosui/result';

import type { Instant } from '../domain/instant/instant.ts';
import type { PostId } from '../domain/post/postId.ts';
import type { AgentChatModel } from '../ports/agentChatModel.ts';
import type { AiError } from '../ports/aiError.ts';
import { runAgentLoop } from './aiAgent/agentLoop.ts';
import {
  type AiAgentBotCapabilities,
  createAgentTools,
  createPublishTool,
  formatPosts,
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
  | Readonly<{ posted: false; reason: 'nothingToSay' }>;

export type PostAiAgentMusingError = AiError | Readonly<{ type: 'AiAgentBotPostError'; message: string }>;

export type PostAiAgentMusingUseCase = UseCase<Input, PostAiAgentMusingResult, PostAiAgentMusingError>;

type Deps = Readonly<{
  chatModel: AgentChatModel;
  now: () => Instant;
}>;

/** AI エージェントの bot が、タイムラインを読んで自分から 1 件投稿する。投稿はエージェントが create_post ツールで行う */
const create = (deps: Deps): PostAiAgentMusingUseCase => {
  const agent = runAgentLoop(deps.chatModel);
  return {
    run: async ({ capabilities, poster }) => {
      const timeline = await capabilities.readRecentTimeline(MAX_RECENT_TIMELINE);
      let postId: PostId | undefined;
      const postTool = createPublishTool({
        name: 'create_post',
        description: '自分の投稿として公開する。投稿の本文だけを渡す。',
        limit: 1,
        done: '投稿しました。',
        publish: async (text) => {
          const posted = await poster.post(text);
          if (!posted.ok) return Result.err(posted.err);
          postId = posted.val;
          return Result.ok(undefined);
        },
      });
      const result = await agent({
        model: AI_AGENT_BOT_MODEL,
        system: musingSystemPrompt(),
        input: musingUserPrompt({ timeline: formatPosts(timeline), now: new Date(deps.now()).toISOString() }),
        tools: [...createAgentTools(capabilities), postTool.tool],
        finalTools: [postTool.tool],
        maxSteps: AI_AGENT_BOT_MAX_STEPS,
        maxOutputTokens: AI_AGENT_BOT_MAX_OUTPUT_TOKENS,
      });
      if (postId !== undefined) return RA.ok({ posted: true, postId });
      if (!result.ok) return result;
      const errors = postTool.errors();
      if (errors.length > 0) return RA.err({ type: 'AiAgentBotPostError', message: errors.join('; ') });
      return RA.ok({ posted: false, reason: 'nothingToSay' });
    },
  };
};

export const PostAiAgentMusingUseCase = { create } as const;
