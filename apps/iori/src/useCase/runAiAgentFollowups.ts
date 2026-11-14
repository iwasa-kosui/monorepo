import { RA } from '@iwasa-kosui/result';

import type { Actor } from '../domain/actor/actor.ts';
import type { ActorId } from '../domain/actor/actorId.ts';
import type { Agg } from '../domain/aggregate/index.ts';
import {
  type AiAgentBotRepliedCountResolverSince,
  MAX_BOT_REPLIES_PER_DAY,
  MAX_BOT_REPLIES_PER_THREAD,
  MAX_BOT_REPLIES_PER_TRIGGER,
} from '../domain/aiAgentBot/aiAgentBot.ts';
import {
  type AiAgentBotDueFollowupsResolver,
  AiAgentBotFollowup,
  type AiAgentBotFollowupHandled,
  type AiAgentBotFollowupsHandledStore,
} from '../domain/aiAgentBot/aiAgentBotFollowup.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { AgentChatModel } from '../ports/agentChatModel.ts';
import { runAgentLoop } from './aiAgent/agentLoop.ts';
import {
  type AiAgentBotCapabilities,
  createAgentTools,
  formatPost,
  formatPosts,
} from './aiAgent/agentTools.ts';
import {
  AI_AGENT_BOT_MAX_OUTPUT_TOKENS,
  AI_AGENT_BOT_MAX_STEPS,
  AI_AGENT_BOT_MODEL,
  followupSystemPrompt,
  followupUserPrompt,
} from './aiAgent/aiAgentBotPrompts.ts';
import { createFollowupTools, type FollowupSchedulerDeps } from './aiAgent/followupScheduler.ts';
import { type AiAgentBotReplier, createThreadedReplyTool, handleOf } from './respondToAiAgentMentions.ts';
import type { UseCase } from './useCase.ts';

/** 1 回の実行で処理するフォローアップの数。cron は 1 分ごとに動くので、少しずつ片付ける */
export const MAX_FOLLOWUPS_PER_RUN = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

type Input = Readonly<{
  bot: Readonly<{ userId: UserId; actorId: ActorId }>;
  capabilities: AiAgentBotCapabilities;
  replier: AiAgentBotReplier;
}>;

export type RunAiAgentFollowupsSummary = Readonly<{
  skipped: 'dailyLimit' | null;
  due: number;
  replied: number;
  ignored: number;
  failed: number;
}>;

export type RunAiAgentFollowupsUseCase = UseCase<Input, RunAiAgentFollowupsSummary, never>;

type Deps = FollowupSchedulerDeps & Readonly<{
  dueFollowupsResolver: AiAgentBotDueFollowupsResolver;
  followupsHandledStore: AiAgentBotFollowupsHandledStore;
  repliedCountResolverSince: AiAgentBotRepliedCountResolverSince;
  actorResolverById: Agg.Resolver<ActorId, Actor | undefined>;
  chatModel: AgentChatModel;
}>;

/**
 * 期日を迎えたフォローアップを実行する。bot はメモとスレッドを読み直して続きを調べ、もとの投稿に続報を返信する。
 * 1 つの予定は 1 回だけ処理し、結果（返信した・返信しなかった・失敗した）を記録する。
 */
const create = (deps: Deps): RunAiAgentFollowupsUseCase => {
  const agent = runAgentLoop(deps.chatModel);

  const followUp = async (
    followup: AiAgentBotFollowup,
    { bot, capabilities, replier }: Input,
  ): Promise<Omit<AiAgentBotFollowupHandled, 'handledAt' | 'followupId'>> => {
    const author = (await deps.actorResolverById.resolve(followup.authorActorId)).val;
    const thread = await capabilities.readThread(followup.postId);
    const botRepliesInThread = thread.filter((post) => post.authorActorId === bot.actorId).length;
    const decision = AiAgentBotFollowup.decide({ followup, botRepliesInThread, now: deps.now() });
    if (decision.type === 'ignore') return { outcome: 'ignored', reason: decision.reason };

    const target = thread.find((post) => post.postId === followup.postId)
      ?? await capabilities.readPost(followup.postId);
    if (target === undefined) return { outcome: 'failed', reason: 'The follow-up post is not visible to the bot.' };

    const replyTool = createThreadedReplyTool({
      replier,
      author,
      postId: followup.postId,
      limit: Math.min(MAX_BOT_REPLIES_PER_TRIGGER, MAX_BOT_REPLIES_PER_THREAD - botRepliesInThread),
    });

    const now = deps.now();
    const result = await agent({
      model: AI_AGENT_BOT_MODEL,
      system: followupSystemPrompt(),
      input: followupUserPrompt({
        thread: formatPosts(thread.filter((post) => post.postId !== followup.postId)),
        target: formatPost(target),
        author: handleOf(author),
        note: followup.note,
        scheduledAt: new Date(followup.scheduledAt).toISOString(),
        now: new Date(now).toISOString(),
      }),
      tools: [
        ...createAgentTools(capabilities),
        replyTool.tool,
        ...createFollowupTools(deps, {
          postId: followup.postId,
          authorActorId: followup.authorActorId,
          round: followup.round + 1,
        }),
      ],
      finalTools: [replyTool.tool],
      maxSteps: AI_AGENT_BOT_MAX_STEPS,
      maxOutputTokens: AI_AGENT_BOT_MAX_OUTPUT_TOKENS,
    });
    if (replyTool.published() > 0) return { outcome: 'replied', reason: null };
    if (!result.ok) return { outcome: 'failed', reason: result.err.message };
    const errors = replyTool.errors();
    if (errors.length > 0) return { outcome: 'failed', reason: errors.join('; ') };
    return { outcome: 'ignored', reason: 'noReply' };
  };

  return {
    run: async (input) => {
      const now = deps.now();
      const repliedToday = (await deps.repliedCountResolverSince.resolve(Instant.addDuration(now, -DAY_MS))).val;
      if (repliedToday >= MAX_BOT_REPLIES_PER_DAY) {
        return RA.ok({ skipped: 'dailyLimit', due: 0, replied: 0, ignored: 0, failed: 0 });
      }
      const due = (await deps.dueFollowupsResolver.resolve({
        now,
        limit: Math.min(MAX_FOLLOWUPS_PER_RUN, MAX_BOT_REPLIES_PER_DAY - repliedToday),
      })).val;

      const counts = { replied: 0, ignored: 0, failed: 0 };
      for (const followup of due) {
        let handled: Omit<AiAgentBotFollowupHandled, 'handledAt' | 'followupId'>;
        try {
          handled = await followUp(followup, input);
        } catch (error) {
          handled = { outcome: 'failed', reason: error instanceof Error ? error.message : String(error) };
        }
        counts[handled.outcome]++;
        await deps.followupsHandledStore.store({
          followupId: followup.followupId,
          handledAt: deps.now(),
          ...handled,
        });
      }
      return RA.ok({ skipped: null, due: due.length, ...counts });
    },
  };
};

export const RunAiAgentFollowupsUseCase = { create } as const;
