import { RA, Result } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { ActorId } from '../../domain/actor/actorId.ts';
import type {
  AiAgentBotTriggerClaimedStore,
  AiAgentBotTriggerHandled,
  AiAgentBotTriggersHandledStore,
} from '../../domain/aiAgentBot/aiAgentBot.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { PostId } from '../../domain/post/postId.ts';
import { UserId } from '../../domain/user/userId.ts';
import type { AgentChatModel } from '../../ports/agentChatModel.ts';
import type { AgentPostView, AiAgentBotCapabilities } from '../aiAgent/agentTools.ts';
import { PostAiAgentMusingUseCase } from '../postAiAgentMusing.ts';
import { type AiAgentBotReply, RespondToAiAgentMentionsUseCase } from '../respondToAiAgentMentions.ts';

const botActorId = ActorId.orThrow('0192f6a0-0000-7000-8000-0000000000b0');
const botUserId = UserId.orThrow('0192f6a0-0000-7000-8000-0000000000b1');
const aliceActorId = ActorId.orThrow('0192f6a0-0000-7000-8000-0000000000a0');
const now = Instant.orThrow(Date.UTC(2026, 10, 14));

const post = (id: string, authorActorId: ActorId, text: string): AgentPostView => ({
  postId: PostId.orThrow(id),
  authorActorId,
  author: authorActorId === botActorId ? '@iori_bot' : '@alice',
  text,
  createdAt: new Date(now).toISOString(),
});

const answering = (answer: string): AgentChatModel => ({
  chat: async () => RA.ok({ content: answer, toolCalls: [] }),
});

const capabilitiesOf = (
  posts: Readonly<{ timeline?: readonly AgentPostView[]; own?: readonly AgentPostView[] }>,
): AiAgentBotCapabilities => ({
  readPost: async (postId) => posts.timeline?.find((p) => p.postId === postId),
  readThread: async (postId) => posts.timeline?.filter((p) => p.postId === postId) ?? [],
  searchTimeline: async () => [],
  readRecentTimeline: async () => [...(posts.own ?? []), ...(posts.timeline ?? [])],
  readOwnRecentPosts: async () => posts.own ?? [],
  fetchUrl: async () => Result.err('unused'),
  likePost: async () => Result.ok(undefined),
  repostPost: async () => Result.ok(undefined),
  followAuthor: async () => Result.ok(undefined),
});

describe('PostAiAgentMusingUseCase', () => {
  const previous = post(
    '0192f6a0-0000-7000-8000-000000000001',
    botActorId,
    '分散型SNSの良さは、自分のデータを自分で持てることだと思います。みなさんはどう考えますか？',
  );

  it('答えが自分の最近の投稿の繰り返しなら投稿しない', async () => {
    const posted: string[] = [];
    const result = await PostAiAgentMusingUseCase.create({ chatModel: answering(previous.text), now: () => now }).run({
      capabilities: capabilitiesOf({ own: [previous] }),
      poster: { post: async (text) => (posted.push(text), Result.ok(PostId.orThrow(previous.postId))) },
    });

    expect(result).toEqual({ ok: true, val: { posted: false, reason: 'repeated' } });
    expect(posted).toEqual([]);
  });

  it('新しい話題の答えは投稿する', async () => {
    const posted: string[] = [];
    const text = 'ActivityPub の Move アクティビティを調べました。アカウントの引っ越しの仕組みが面白いです。';
    const result = await PostAiAgentMusingUseCase.create({ chatModel: answering(text), now: () => now }).run({
      capabilities: capabilitiesOf({ own: [previous] }),
      poster: { post: async (body) => (posted.push(body), Result.ok(PostId.orThrow(previous.postId))) },
    });

    expect(result.ok && result.val.posted).toBe(true);
    expect(posted).toEqual([text]);
  });
});

describe('RespondToAiAgentMentionsUseCase', () => {
  it('2 つの cron の実行が同じトリガーで重なっても、返信は 1 回だけ', async () => {
    const mention = post('0192f6a0-0000-7000-8000-000000000002', aliceActorId, '@iori_bot こんにちは');
    const records = new Map<string, AiAgentBotTriggerHandled | 'claimed'>();
    const triggerClaimedStore: AiAgentBotTriggerClaimedStore = {
      store: async ({ postId }) => {
        if (records.has(postId)) return RA.ok(false);
        records.set(postId, 'claimed');
        return RA.ok(true);
      },
    };
    const triggersHandledStore: AiAgentBotTriggersHandledStore = {
      store: async (...handled) => {
        for (const entry of handled) records.set(entry.postId, entry);
        return RA.ok(undefined);
      },
    };
    const useCase = RespondToAiAgentMentionsUseCase.create({
      // 処理の記録を見ずに返す。2 つの実行が、記録が付く前に同じトリガーを読んだ状況を再現する
      pendingTriggersResolver: {
        resolve: async () => RA.ok([{ postId: mention.postId, authorActorId: aliceActorId, receivedAt: now }]),
      },
      triggerClaimedStore,
      triggersHandledStore,
      repliedCountResolverSince: { resolve: async () => RA.ok(0) },
      actorResolverById: { resolve: async () => RA.ok(undefined) },
      chatModel: answering('こんにちは！'),
      now: () => now,
    });
    const replies: AiAgentBotReply[] = [];
    const input = {
      bot: { userId: botUserId, actorId: botActorId },
      capabilities: capabilitiesOf({ timeline: [mention] }),
      replier: { reply: async (reply: AiAgentBotReply) => (replies.push(reply), Result.ok(undefined)) },
    };

    const [first, second] = await Promise.all([useCase.run(input), useCase.run(input)]);

    expect(replies).toHaveLength(1);
    expect([first.val.replied + second.val.replied, first.val.claimedElsewhere + second.val.claimedElsewhere])
      .toEqual([1, 1]);
    expect(records.get(mention.postId)).toMatchObject({ outcome: 'replied' });
  });
});
