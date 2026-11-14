import { RA, type Result } from '@iwasa-kosui/result';

import type { Actor } from '../domain/actor/actor.ts';
import type { ActorId } from '../domain/actor/actorId.ts';
import type { Agg } from '../domain/aggregate/index.ts';
import {
  AiAgentBot,
  type AiAgentBotPendingTriggersResolver,
  type AiAgentBotRepliedCountResolverSince,
  type AiAgentBotTrigger,
  type AiAgentBotTriggerClaimedStore,
  type AiAgentBotTriggerHandled,
  type AiAgentBotTriggersHandledStore,
  MAX_BOT_REPLIES_PER_DAY,
} from '../domain/aiAgentBot/aiAgentBot.ts';
import { Instant } from '../domain/instant/instant.ts';
import { type MentionRecipient } from '../domain/post/mention.ts';
import { plainTextToHtml } from '../domain/post/plainTextToHtml.ts';
import type { PostId } from '../domain/post/postId.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { AgentChatModel } from '../ports/agentChatModel.ts';
import { runAgentLoop } from './aiAgent/agentLoop.ts';
import { type AiAgentBotCapabilities, createAgentTools, formatPost, formatPosts } from './aiAgent/agentTools.ts';
import {
  AI_AGENT_BOT_MAX_OUTPUT_TOKENS,
  AI_AGENT_BOT_MAX_STEPS,
  AI_AGENT_BOT_MODEL,
  mentionSystemPrompt,
  mentionUserPrompt,
} from './aiAgent/aiAgentBotPrompts.ts';
import type { UseCase } from './useCase.ts';

/** 1 回の実行で答えるトリガーの数。cron は 1 分ごとに動くので、少しずつ片付ける */
export const MAX_TRIGGERS_PER_RUN = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export type AiAgentBotReply = Readonly<{
  postId: PostId;
  content: string;
  mentions: readonly MentionRecipient[];
}>;

/** bot として返信を送る。runtime が SendReplyUseCase を包んで用意する */
export type AiAgentBotReplier = Readonly<{
  reply: (reply: AiAgentBotReply) => Promise<Result<void, string>>;
}>;

type Input = Readonly<{
  bot: Readonly<{ userId: UserId; actorId: ActorId }>;
  capabilities: AiAgentBotCapabilities;
  replier: AiAgentBotReplier;
}>;

export type RespondToAiAgentMentionsSummary = Readonly<{
  skipped: 'dailyLimit' | null;
  pending: number;
  /** ほかの実行が先に処理し始めていたので、答えなかった数 */
  claimedElsewhere: number;
  replied: number;
  ignored: number;
  failed: number;
}>;

export type RespondToAiAgentMentionsUseCase = UseCase<Input, RespondToAiAgentMentionsSummary, never>;

type ActorResolverById = Agg.Resolver<ActorId, Actor | undefined>;

type Deps = Readonly<{
  pendingTriggersResolver: AiAgentBotPendingTriggersResolver;
  triggerClaimedStore: AiAgentBotTriggerClaimedStore;
  triggersHandledStore: AiAgentBotTriggersHandledStore;
  repliedCountResolverSince: AiAgentBotRepliedCountResolverSince;
  actorResolverById: ActorResolverById;
  chatModel: AgentChatModel;
  now: () => Instant;
}>;

const handleOf = (actor: Actor | undefined): string => {
  if (actor === undefined) return '(不明なアカウント)';
  if (actor.type === 'local') return actor.displayName ?? actor.uri;
  const host = URL.canParse(actor.uri) ? new URL(actor.uri).host : undefined;
  return actor.username === undefined || host === undefined ? actor.uri : `@${actor.username}@${host}`;
};

/** 返信の本文を作る。リモートの相手には、先頭にメンションを付けて相手に届くようにする */
export const buildReplyContent = (
  author: Actor | undefined,
  text: string,
): Readonly<{ content: string; mentions: readonly MentionRecipient[] }> => {
  if (author?.type !== 'remote' || author.username === undefined || !URL.canParse(author.uri)) {
    return { content: plainTextToHtml(text), mentions: [] };
  }
  const acct = `${author.username}@${new URL(author.uri).host}`;
  return {
    content: plainTextToHtml(`@${acct} ${text}`, new Map([[acct, author.uri]])),
    mentions: [{ id: author.uri, inboxUrl: author.inboxUrl }],
  };
};

/**
 * bot 宛てのメンションと、bot の投稿への返信に、AI エージェントが答える。
 * 1 つのトリガーには 1 回だけ答え、結果（返信した・答えなかった・失敗した）を記録する。
 * 答える前に処理中の印を付け、重なって動いた実行が同じトリガーに 2 回答えないようにする。
 */
const create = (deps: Deps): RespondToAiAgentMentionsUseCase => {
  const agent = runAgentLoop(deps.chatModel);

  const respond = async (
    trigger: AiAgentBotTrigger,
    { bot, capabilities, replier }: Input,
  ): Promise<Omit<AiAgentBotTriggerHandled, 'handledAt' | 'postId'>> => {
    const author = (await deps.actorResolverById.resolve(trigger.authorActorId)).val;
    const thread = await capabilities.readThread(trigger.postId);
    const decision = AiAgentBot.decideResponse({
      trigger,
      botActorId: bot.actorId,
      authorActorType: author?.type === 'remote' ? author.actorType : undefined,
      botRepliesInThread: thread.filter((post) => post.authorActorId === bot.actorId).length,
      now: deps.now(),
    });
    if (decision.type === 'ignore') return { outcome: 'ignored', reason: decision.reason };

    const triggerPost = thread.find((post) => post.postId === trigger.postId)
      ?? await capabilities.readPost(trigger.postId);
    if (triggerPost === undefined) return { outcome: 'failed', reason: 'The trigger post is not visible to the bot.' };

    const result = await agent({
      model: AI_AGENT_BOT_MODEL,
      system: mentionSystemPrompt(),
      input: mentionUserPrompt({
        thread: formatPosts(thread.filter((post) => post.postId !== trigger.postId)),
        trigger: formatPost(triggerPost),
        author: handleOf(author),
      }),
      tools: createAgentTools(capabilities),
      maxSteps: AI_AGENT_BOT_MAX_STEPS,
      maxOutputTokens: AI_AGENT_BOT_MAX_OUTPUT_TOKENS,
    });
    if (!result.ok) return { outcome: 'failed', reason: result.err.message };

    const answer = result.val.answer === undefined ? undefined : AiAgentBot.normalizeAnswer(result.val.answer);
    if (answer === undefined) return { outcome: 'ignored', reason: 'emptyAnswer' };

    const sent = await replier.reply({ postId: trigger.postId, ...buildReplyContent(author, answer) });
    return sent.ok ? { outcome: 'replied', reason: null } : { outcome: 'failed', reason: sent.err };
  };

  return {
    run: async (input) => {
      const repliedToday = (await deps.repliedCountResolverSince.resolve(Instant.addDuration(deps.now(), -DAY_MS)))
        .val;
      if (repliedToday >= MAX_BOT_REPLIES_PER_DAY) {
        return RA.ok({ skipped: 'dailyLimit', pending: 0, claimedElsewhere: 0, replied: 0, ignored: 0, failed: 0 });
      }
      const pending = (await deps.pendingTriggersResolver.resolve({
        botUserId: input.bot.userId,
        limit: Math.min(MAX_TRIGGERS_PER_RUN, MAX_BOT_REPLIES_PER_DAY - repliedToday),
      })).val;

      const counts = { claimedElsewhere: 0, replied: 0, ignored: 0, failed: 0 };
      for (const trigger of pending) {
        const claimed = (await deps.triggerClaimedStore.store({ postId: trigger.postId, claimedAt: deps.now() })).val;
        if (!claimed) {
          counts.claimedElsewhere++;
          continue;
        }
        let handled: Omit<AiAgentBotTriggerHandled, 'handledAt' | 'postId'>;
        try {
          handled = await respond(trigger, input);
        } catch (error) {
          handled = { outcome: 'failed', reason: error instanceof Error ? error.message : String(error) };
        }
        counts[handled.outcome]++;
        await deps.triggersHandledStore.store({ postId: trigger.postId, handledAt: deps.now(), ...handled });
      }
      return RA.ok({ skipped: null, pending: pending.length, ...counts });
    },
  };
};

export const RespondToAiAgentMentionsUseCase = { create } as const;
