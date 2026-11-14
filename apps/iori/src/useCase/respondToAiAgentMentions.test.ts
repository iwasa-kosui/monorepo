import { RA, Result } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { ActorId } from '../domain/actor/actorId.ts';
import {
  type AiAgentBotTrigger,
  type AiAgentBotTriggerHandled,
  MAX_BOT_REPLIES_PER_TRIGGER,
} from '../domain/aiAgentBot/aiAgentBot.ts';
import { MAX_PENDING_FOLLOWUPS } from '../domain/aiAgentBot/aiAgentBotFollowup.ts';
import { Instant } from '../domain/instant/instant.ts';
import { PostId } from '../domain/post/postId.ts';
import { UserId } from '../domain/user/userId.ts';
import type { AgentChatModel, AgentChatRequest, AgentChatResponse } from '../ports/agentChatModel.ts';
import { createInMemoryFollowups } from './aiAgent/__tests__/inMemoryFollowups.ts';
import type { AgentPostView, AiAgentBotCapabilities } from './aiAgent/agentTools.ts';
import { AI_AGENT_BOT_MAX_STEPS } from './aiAgent/aiAgentBotPrompts.ts';
import { type AiAgentBotReply, RespondToAiAgentMentionsUseCase } from './respondToAiAgentMentions.ts';

const NOW = Instant.orThrow(1_800_000_000_000);
const BOT = { userId: UserId.generate(), actorId: ActorId.generate() };
const AUTHOR_ACTOR_ID = ActorId.generate();
const TRIGGER_POST_ID = PostId.generate();

const triggerPost: AgentPostView = {
  postId: TRIGGER_POST_ID,
  authorActorId: AUTHOR_ACTOR_ID,
  author: 'alice',
  text: 'これについて教えて',
  createdAt: new Date(NOW).toISOString(),
};

const trigger: AiAgentBotTrigger = { postId: TRIGGER_POST_ID, authorActorId: AUTHOR_ACTOR_ID, receivedAt: NOW };

const capabilities: AiAgentBotCapabilities = {
  readPost: async () => triggerPost,
  readThread: async () => [triggerPost],
  searchTimeline: async () => [],
  readRecentTimeline: async () => [],
  fetchUrl: async () => Result.err('unused'),
  likePost: async () => Result.ok(undefined),
  repostPost: async () => Result.ok(undefined),
  followAuthor: async () => Result.ok(undefined),
};

const toolCall = (name: string, args: unknown): AgentChatResponse => ({
  content: undefined,
  toolCalls: [{ id: `call-${name}`, name, arguments: args }],
});

const scriptedModel = (script: (request: AgentChatRequest, call: number) => AgentChatResponse) => {
  const requests: AgentChatRequest[] = [];
  const model: AgentChatModel = {
    chat: async (request) => {
      requests.push(request);
      return RA.ok(script(request, requests.length - 1));
    },
  };
  return { model, requests };
};

const run = async (
  chatModel: AgentChatModel,
  replyResult: Result<null, string> = Result.ok(null),
  pendingFollowups = 0,
  sentIds: PostId[] = [],
) => {
  const followups = createInMemoryFollowups(() => NOW, pendingFollowups);
  const stored: AiAgentBotTriggerHandled[] = [];
  const replies: AiAgentBotReply[] = [];
  const useCase = RespondToAiAgentMentionsUseCase.create({
    pendingTriggersResolver: { resolve: () => RA.ok([trigger]) },
    triggersHandledStore: {
      store: (...handled) => {
        stored.push(...handled);
        return RA.ok(undefined);
      },
    },
    repliedCountResolverSince: { resolve: () => RA.ok(0) },
    actorResolverById: { resolve: () => RA.ok(undefined) },
    chatModel,
    ...followups.deps,
  });
  const summary = await useCase.run({
    bot: BOT,
    capabilities,
    replier: {
      reply: async (reply) => {
        replies.push(reply);
        if (!replyResult.ok) return Result.err(replyResult.err);
        const sent = PostId.generate();
        sentIds.push(sent);
        return Result.ok(sent);
      },
    },
  });
  return { summary: summary.val, stored, replies, scheduled: followups.scheduled };
};

describe('RespondToAiAgentMentionsUseCase', () => {
  it('reply ツールで返信したら、返信したと記録する', async () => {
    const { model } = scriptedModel((_, call) =>
      call === 0 ? toolCall('reply', { text: '調べた結果です。' }) : { content: 'おわり', toolCalls: [] }
    );
    const { summary, stored, replies } = await run(model);
    expect(replies).toEqual([{ postId: TRIGGER_POST_ID, content: '<p>調べた結果です。</p>', mentions: [] }]);
    expect(stored).toMatchObject([{ postId: TRIGGER_POST_ID, outcome: 'replied', reason: null }]);
    expect(summary.replied).toBe(1);
  });

  it('reply を使わずに終えたら、最後の文は送らず、答えなかったと記録する', async () => {
    const { model } = scriptedModel(() => ({ content: '引き続き調べます', toolCalls: [] }));
    const { stored, replies } = await run(model);
    expect(replies).toEqual([]);
    expect(stored).toMatchObject([{ outcome: 'ignored', reason: 'noReply' }]);
  });

  it('1 つのトリガーに返信できる回数を超えたら、それ以上は送らない', async () => {
    const { model } = scriptedModel((_, call) =>
      call <= MAX_BOT_REPLIES_PER_TRIGGER
        ? toolCall('reply', { text: `返信 ${call}` })
        : { content: undefined, toolCalls: [] }
    );
    const { replies, stored } = await run(model);
    expect(replies).toHaveLength(MAX_BOT_REPLIES_PER_TRIGGER);
    expect(stored).toMatchObject([{ outcome: 'replied' }]);
  });

  it('続けて返信すると、2 回目からは自分の直前の返信に返信して、スレッドにつなげる', async () => {
    const { model } = scriptedModel((_, call) =>
      call < 3 ? toolCall('reply', { text: `その ${call + 1}` }) : { content: undefined, toolCalls: [] }
    );
    const sentIds: PostId[] = [];
    const { replies } = await run(model, Result.ok(null), 0, sentIds);
    expect(replies.map((reply) => reply.postId)).toEqual([TRIGGER_POST_ID, sentIds[0], sentIds[1]]);
  });

  it('ステップの上限に達したら、reply ツールだけを渡して仕上げさせる', async () => {
    const { model, requests } = scriptedModel((request) =>
      request.tools.length === 1
        ? toolCall('reply', { text: '分かったことだけ返します。' })
        : toolCall('get_recent_timeline', {})
    );
    const { replies, stored } = await run(model);
    expect(requests).toHaveLength(AI_AGENT_BOT_MAX_STEPS + 1);
    expect(requests.at(-1)?.tools.map((tool) => tool.name)).toEqual(['reply']);
    expect(replies).toHaveLength(1);
    expect(stored).toMatchObject([{ outcome: 'replied' }]);
  });

  it('返信に失敗したら、失敗したと記録する', async () => {
    const { model } = scriptedModel((_, call) =>
      call === 0 ? toolCall('reply', { text: 'こんにちは' }) : { content: undefined, toolCalls: [] }
    );
    const { stored } = await run(model, Result.err('配送できません'));
    expect(stored).toMatchObject([{ outcome: 'failed', reason: '配送できません' }]);
  });

  it('schedule_followup で、もとの投稿に続報する予定を入れられる', async () => {
    const { model } = scriptedModel((_, call) =>
      call === 0
        ? toolCall('schedule_followup', { note: '公式発表を確かめる', afterMinutes: 60 })
        : call === 1
        ? toolCall('reply', { text: 'あとで続報します。' })
        : { content: undefined, toolCalls: [] }
    );
    const { scheduled, stored } = await run(model);
    expect(scheduled).toMatchObject([{
      postId: TRIGGER_POST_ID,
      authorActorId: AUTHOR_ACTOR_ID,
      note: '公式発表を確かめる',
      round: 1,
      dueAt: NOW + 60 * 60 * 1000,
    }]);
    expect(stored).toMatchObject([{ outcome: 'replied' }]);
  });

  it('処理を待つ予定が上限まで溜まっていたら、予定を入れない', async () => {
    const { model, requests } = scriptedModel((_, call) =>
      call === 0
        ? toolCall('schedule_followup', { note: 'あとで確かめる', afterMinutes: 60 })
        : { content: undefined, toolCalls: [] }
    );
    const { scheduled } = await run(model, Result.ok(null), MAX_PENDING_FOLLOWUPS);
    expect(scheduled).toEqual([]);
    expect(requests[1]?.messages.at(-1)).toMatchObject({ role: 'tool', content: expect.stringMatching(/^エラー/) });
  });
});
