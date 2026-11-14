import { RA, Result } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { ActorId } from '../domain/actor/actorId.ts';
import {
  AiAgentBotFollowup,
  type AiAgentBotFollowupHandled,
  MAX_FOLLOWUP_ROUNDS,
} from '../domain/aiAgentBot/aiAgentBotFollowup.ts';
import { Instant } from '../domain/instant/instant.ts';
import { PostId } from '../domain/post/postId.ts';
import { UserId } from '../domain/user/userId.ts';
import type { AgentChatModel, AgentChatRequest, AgentChatResponse } from '../ports/agentChatModel.ts';
import { createInMemoryFollowups } from './aiAgent/__tests__/inMemoryFollowups.ts';
import type { AgentPostView, AiAgentBotCapabilities } from './aiAgent/agentTools.ts';
import type { AiAgentBotReply } from './respondToAiAgentMentions.ts';
import { RunAiAgentFollowupsUseCase } from './runAiAgentFollowups.ts';

const SCHEDULED_AT = Instant.orThrow(1_800_000_000_000);
const BOT = { userId: UserId.generate(), actorId: ActorId.generate() };
const AUTHOR_ACTOR_ID = ActorId.generate();
const TARGET_POST_ID = PostId.generate();

const target: AgentPostView = {
  postId: TARGET_POST_ID,
  authorActorId: AUTHOR_ACTOR_ID,
  author: 'alice',
  text: '新しい版はいつ出る？',
  createdAt: new Date(SCHEDULED_AT).toISOString(),
};

const followupOf = (round: number) => {
  const followup = AiAgentBotFollowup.schedule({
    postId: TARGET_POST_ID,
    authorActorId: AUTHOR_ACTOR_ID,
    note: 'リリースノートを確かめる',
    delayMinutes: 60,
    round,
    now: SCHEDULED_AT,
  });
  if (!followup.ok) throw new Error('invalid follow-up');
  return followup.val;
};

const capabilities: AiAgentBotCapabilities = {
  readPost: async () => target,
  readThread: async () => [target],
  searchTimeline: async () => [],
  readRecentTimeline: async () => [],
  readOwnRecentPosts: async () => [],
  fetchUrl: async () => Result.err('unused'),
  likePost: async () => Result.ok(undefined),
  repostPost: async () => Result.ok(undefined),
  followAuthor: async () => Result.ok(undefined),
};

const toolCall = (name: string, args: unknown): AgentChatResponse => ({
  content: undefined,
  toolCalls: [{ id: `call-${name}`, name, arguments: args }],
});

const scriptedModel = (responses: readonly AgentChatResponse[]) => {
  const requests: AgentChatRequest[] = [];
  const model: AgentChatModel = {
    chat: async (request) => {
      requests.push(request);
      return RA.ok(responses[requests.length - 1] ?? { content: undefined, toolCalls: [] });
    },
  };
  return { model, requests };
};

const run = async (
  chatModel: AgentChatModel,
  followup: AiAgentBotFollowup,
  now = followup.dueAt,
  claimable = true,
) => {
  const followups = createInMemoryFollowups(() => now);
  const handled: AiAgentBotFollowupHandled[] = [];
  const replies: AiAgentBotReply[] = [];
  const summary = await RunAiAgentFollowupsUseCase.create({
    dueFollowupsResolver: { resolve: () => RA.ok([followup]) },
    followupClaimedStore: { store: () => RA.ok(claimable) },
    followupsHandledStore: {
      store: (...entries) => {
        handled.push(...entries);
        return RA.ok(undefined);
      },
    },
    repliedCountResolverSince: { resolve: () => RA.ok(0) },
    actorResolverById: { resolve: () => RA.ok(undefined) },
    chatModel,
    ...followups.deps,
  }).run({
    bot: BOT,
    capabilities,
    replier: {
      reply: async (reply) => {
        replies.push(reply);
        return Result.ok(PostId.generate());
      },
    },
  });
  return { summary: summary.val, handled, replies, scheduled: followups.scheduled };
};

describe('RunAiAgentFollowupsUseCase', () => {
  it('期日を迎えた予定で、メモを読み直して、もとの投稿に続報を返信する', async () => {
    const followup = followupOf(1);
    const { model, requests } = scriptedModel([toolCall('reply', { text: '来週出るそうです。' })]);
    const { handled, replies } = await run(model, followup);

    expect(requests[0]?.messages[1]?.content).toContain('リリースノートを確かめる');
    expect(replies).toMatchObject([{ postId: TARGET_POST_ID, content: '<p>来週出るそうです。</p>' }]);
    expect(handled).toMatchObject([{ followupId: followup.followupId, outcome: 'replied' }]);
  });

  it('続報で、もう一度予定を入れると、回数が 1 つ増える', async () => {
    const { model } = scriptedModel([toolCall('schedule_followup', { note: 'まだ未発表。また見る', afterMinutes: 1440 })]);
    const { scheduled, handled } = await run(model, followupOf(1));

    expect(scheduled).toMatchObject([{ postId: TARGET_POST_ID, round: 2 }]);
    expect(handled).toMatchObject([{ outcome: 'ignored', reason: 'noReply' }]);
  });

  it('重ねられる回数の上限に達した予定では、もう予定を入れるツールを渡さない', async () => {
    const { model, requests } = scriptedModel([]);
    await run(model, followupOf(MAX_FOLLOWUP_ROUNDS));

    expect(requests[0]?.tools.map((tool) => tool.name)).not.toContain('schedule_followup');
  });

  it('期日から長く過ぎた予定は、モデルを呼ばずに処理済みにする', async () => {
    const followup = followupOf(1);
    const { model, requests } = scriptedModel([]);
    const { handled } = await run(model, followup, Instant.addDuration(followup.dueAt, 2 * 24 * 60 * 60 * 1000));

    expect(requests).toEqual([]);
    expect(handled).toMatchObject([{ outcome: 'ignored', reason: 'expired' }]);
  });

  it('ほかの実行が先に処理し始めた予定は、続報せずに飛ばす', async () => {
    const { model, requests } = scriptedModel([toolCall('reply', { text: '続報です。' })]);
    const followup = followupOf(1);
    const { summary, replies, handled } = await run(model, followup, followup.dueAt, false);

    expect(requests).toEqual([]);
    expect(replies).toEqual([]);
    expect(handled).toEqual([]);
    expect(summary.claimedElsewhere).toBe(1);
  });
});
