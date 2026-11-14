import { RA, Result } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { ActorId } from '../domain/actor/actorId.ts';
import type { AiAgentBotTrigger, AiAgentBotTriggerHandled } from '../domain/aiAgentBot/aiAgentBot.ts';
import { Instant } from '../domain/instant/instant.ts';
import { PostId } from '../domain/post/postId.ts';
import { UserId } from '../domain/user/userId.ts';
import type { AgentChatModel, AgentChatRequest, AgentChatResponse } from '../ports/agentChatModel.ts';
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

const run = async (chatModel: AgentChatModel, replyResult: Result<void, string> = Result.ok(undefined)) => {
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
    now: () => NOW,
  });
  const summary = await useCase.run({
    bot: BOT,
    capabilities,
    replier: {
      reply: async (reply) => {
        replies.push(reply);
        return replyResult;
      },
    },
  });
  return { summary: summary.val, stored, replies };
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
      call < 3 ? toolCall('reply', { text: `返信 ${call}` }) : { content: undefined, toolCalls: [] }
    );
    const { replies, stored } = await run(model);
    expect(replies).toHaveLength(2);
    expect(stored).toMatchObject([{ outcome: 'replied' }]);
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
});
