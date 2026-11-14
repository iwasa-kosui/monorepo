import { RA, Result } from '@iwasa-kosui/result';

import type { Actor } from '../domain/actor/actor.ts';
import type { ActorId } from '../domain/actor/actorId.ts';
import type { Agg } from '../domain/aggregate/index.ts';
import {
  AiAgentBot,
  type AiAgentBotPendingTriggersResolver,
  type AiAgentBotRepliedCountResolverSince,
  type AiAgentBotTrigger,
  type AiAgentBotTriggerHandled,
  type AiAgentBotTriggersHandledStore,
  MAX_BOT_REPLIES_PER_DAY,
  MAX_BOT_REPLIES_PER_THREAD,
  MAX_BOT_REPLIES_PER_TRIGGER,
} from '../domain/aiAgentBot/aiAgentBot.ts';
import { Instant } from '../domain/instant/instant.ts';
import { type MentionRecipient } from '../domain/post/mention.ts';
import { plainTextToHtml } from '../domain/post/plainTextToHtml.ts';
import type { PostId } from '../domain/post/postId.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { AgentChatModel } from '../ports/agentChatModel.ts';
import { runAgentLoop } from './aiAgent/agentLoop.ts';
import {
  type AiAgentBotCapabilities,
  createAgentTools,
  createPublishTool,
  formatPost,
  formatPosts,
  type PublishTool,
} from './aiAgent/agentTools.ts';
import {
  AI_AGENT_BOT_MAX_OUTPUT_TOKENS,
  AI_AGENT_BOT_MAX_STEPS,
  AI_AGENT_BOT_MODEL,
  mentionSystemPrompt,
  mentionUserPrompt,
} from './aiAgent/aiAgentBotPrompts.ts';
import { createFollowupTools, type FollowupSchedulerDeps } from './aiAgent/followupScheduler.ts';
import type { UseCase } from './useCase.ts';

/** 1 回の実行で答えるトリガーの数。cron は 1 分ごとに動くので、少しずつ片付ける */
export const MAX_TRIGGERS_PER_RUN = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

export type AiAgentBotReply = Readonly<{
  postId: PostId;
  content: string;
  mentions: readonly MentionRecipient[];
}>;

/** bot として返信を送り、送った返信の postId を返す。runtime が SendReplyUseCase を包んで用意する */
export type AiAgentBotReplier = Readonly<{
  reply: (reply: AiAgentBotReply) => Promise<Result<PostId, string>>;
}>;

type Input = Readonly<{
  bot: Readonly<{ userId: UserId; actorId: ActorId }>;
  capabilities: AiAgentBotCapabilities;
  replier: AiAgentBotReplier;
}>;

export type RespondToAiAgentMentionsSummary = Readonly<{
  skipped: 'dailyLimit' | null;
  pending: number;
  replied: number;
  ignored: number;
  failed: number;
}>;

export type RespondToAiAgentMentionsUseCase = UseCase<Input, RespondToAiAgentMentionsSummary, never>;

type ActorResolverById = Agg.Resolver<ActorId, Actor | undefined>;

type Deps = FollowupSchedulerDeps & Readonly<{
  pendingTriggersResolver: AiAgentBotPendingTriggersResolver;
  triggersHandledStore: AiAgentBotTriggersHandledStore;
  repliedCountResolverSince: AiAgentBotRepliedCountResolverSince;
  actorResolverById: ActorResolverById;
  chatModel: AgentChatModel;
  now: () => Instant;
}>;

export const handleOf = (actor: Actor | undefined): string => {
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
 * reply ツールを作る。1 回目は postId の投稿に、2 回目からは直前に送った自分の返信に返信して、スレッドにつなげる。
 * 各返信の先頭には相手へのメンションを付ける。
 */
export const createThreadedReplyTool = (
  input: Readonly<{ replier: AiAgentBotReplier; author: Actor | undefined; postId: PostId; limit: number }>,
): PublishTool => {
  let replyTo = input.postId;
  return createPublishTool({
    name: 'reply',
    description: [
      '答える投稿に返信する。返信の本文だけを渡す。',
      `1 回に収まらない長い答えは、要点ごとに分けて何回か続けて呼んでよい（${input.limit} 回まで）。`,
      '2 回目からは、自分の直前の返信への返信になり、スレッドとして読める。',
    ].join(''),
    limit: input.limit,
    done: '返信しました。続きがあれば、もう一度 reply を呼べます。',
    publish: async (text) => {
      const sent = await input.replier.reply({ postId: replyTo, ...buildReplyContent(input.author, text) });
      if (!sent.ok) return Result.err(sent.err);
      replyTo = sent.val;
      return Result.ok(undefined);
    },
  });
};

/**
 * bot 宛てのメンションと、bot の投稿への返信に、AI エージェントが答える。
 * 返信はエージェントが reply ツールで行う。reply を使わずに終えたら、答えなかったことになる。
 * 1 つのトリガーは 1 回だけ処理し、結果（返信した・答えなかった・失敗した）を記録する。
 */
const create = (deps: Deps): RespondToAiAgentMentionsUseCase => {
  const agent = runAgentLoop(deps.chatModel);

  const respond = async (
    trigger: AiAgentBotTrigger,
    { bot, capabilities, replier }: Input,
  ): Promise<Omit<AiAgentBotTriggerHandled, 'handledAt' | 'postId'>> => {
    const author = (await deps.actorResolverById.resolve(trigger.authorActorId)).val;
    const thread = await capabilities.readThread(trigger.postId);
    const botRepliesInThread = thread.filter((post) => post.authorActorId === bot.actorId).length;
    const decision = AiAgentBot.decideResponse({
      trigger,
      authorActorType: author?.type === 'remote' ? author.actorType : undefined,
      botRepliesInThread,
      now: deps.now(),
    });
    if (decision.type === 'ignore') return { outcome: 'ignored', reason: decision.reason };

    const triggerPost = thread.find((post) => post.postId === trigger.postId)
      ?? await capabilities.readPost(trigger.postId);
    if (triggerPost === undefined) return { outcome: 'failed', reason: 'The trigger post is not visible to the bot.' };

    const replyTool = createThreadedReplyTool({
      replier,
      author,
      postId: trigger.postId,
      limit: Math.min(MAX_BOT_REPLIES_PER_TRIGGER, MAX_BOT_REPLIES_PER_THREAD - botRepliesInThread),
    });

    const result = await agent({
      model: AI_AGENT_BOT_MODEL,
      system: mentionSystemPrompt(),
      input: mentionUserPrompt({
        thread: formatPosts(thread.filter((post) => post.postId !== trigger.postId)),
        trigger: formatPost(triggerPost),
        author: handleOf(author),
      }),
      tools: [
        ...createAgentTools(capabilities),
        replyTool.tool,
        ...createFollowupTools(deps, { postId: trigger.postId, authorActorId: trigger.authorActorId, round: 1 }),
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
      const repliedToday = (await deps.repliedCountResolverSince.resolve(Instant.addDuration(deps.now(), -DAY_MS)))
        .val;
      if (repliedToday >= MAX_BOT_REPLIES_PER_DAY) {
        return RA.ok({ skipped: 'dailyLimit', pending: 0, replied: 0, ignored: 0, failed: 0 });
      }
      const pending = (await deps.pendingTriggersResolver.resolve({
        botUserId: input.bot.userId,
        limit: Math.min(MAX_TRIGGERS_PER_RUN, MAX_BOT_REPLIES_PER_DAY - repliedToday),
      })).val;

      const counts = { replied: 0, ignored: 0, failed: 0 };
      for (const trigger of pending) {
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
