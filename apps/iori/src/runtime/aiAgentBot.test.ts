import { Result } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createAiAgentBotPoster, createAiAgentBotReplier } from './aiAgentBot.ts';

type Bot = Parameters<typeof createAiAgentBotPoster>[1];
type Runtime = Parameters<typeof createAiAgentBotPoster>[0];
type Context = Parameters<typeof createAiAgentBotReplier>[2];

const bot = { user: { id: 'bot-user' }, actor: { id: 'bot-actor' } } as unknown as Bot;
const context = { request: new Request('https://iori.example/'), ctx: {} } as unknown as Context;

describe('bot の投稿の公開範囲', () => {
  it('自分からの投稿はフォロワーのみにする', async () => {
    const run = vi.fn(async (_input: unknown) => Result.ok({ post: { postId: 'post-1' } }));
    const runtime = { posting: { createPostUseCase: { run } } } as unknown as Runtime;

    const posted = await createAiAgentBotPoster(runtime, bot, context).post('こんにちは');

    expect(posted).toEqual(Result.ok('post-1'));
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'private' }));
  });

  it('返信はフォロワーのみを既定にする', async () => {
    const run = vi.fn(async (_input: unknown) => Result.ok({ post: { postId: 'reply-1' } }));
    const runtime = { core: { sendReplyUseCase: { run } } } as unknown as Runtime;

    const replied = await createAiAgentBotReplier(runtime, bot, context).reply(
      {
        postId: 'parent-1',
        content: '<p>返信</p>',
        mentions: [],
      } as unknown as Parameters<ReturnType<typeof createAiAgentBotReplier>['reply']>[0],
    );

    expect(replied).toEqual(Result.ok('reply-1'));
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'private' }));
  });
});
