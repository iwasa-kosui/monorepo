import { RA } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { createIoriApp } from '../../../appFactory.tsx';
import { createMockRequestContext } from '../../../useCase/__tests__/helper/mockAdaptors.ts';
import type { SendEmojiReactUseCase } from '../../../useCase/sendEmojiReact.ts';
import type { SendLikeUseCase } from '../../../useCase/sendLike.ts';
import type { SendRepostUseCase } from '../../../useCase/sendRepost.ts';
import type { UndoEmojiReactUseCase } from '../../../useCase/undoEmojiReact.ts';
import type { UndoLikeUseCase } from '../../../useCase/undoLike.ts';
import type { UndoRepostUseCase } from '../../../useCase/undoRepost.ts';
import { createWorkerSocialActionsApiRouter } from '../workerSocialActionsApiRouter.ts';

const sessionCookie = 'sessionId=4dc530d6-d06c-4b4a-a021-0e1aee0b6d82';
const postId = '573c7c51-0e4b-453c-bb9f-5dbd15a319a7';

describe('createWorkerSocialActionsApiRouter', () => {
  it('serves authenticated like, repost, and emoji reaction mutations', async () => {
    const checkPostId = (input: { postId: string }) =>
      input.postId === postId ? RA.ok(undefined) : RA.err({ type: 'WrongPostId' } as never);
    const sendLikeUseCase: SendLikeUseCase = { run: checkPostId };
    const undoLikeUseCase: UndoLikeUseCase = { run: checkPostId };
    const sendRepostUseCase: SendRepostUseCase = { run: checkPostId };
    const undoRepostUseCase: UndoRepostUseCase = { run: checkPostId };
    const checkReaction = (input: { postId: string; emoji: string }) =>
      input.postId === postId && input.emoji === ':wave:'
        ? RA.ok(undefined)
        : RA.err({ type: 'WrongReaction' } as never);
    const sendEmojiReactUseCase: SendEmojiReactUseCase = { run: checkReaction };
    const undoEmojiReactUseCase: UndoEmojiReactUseCase = { run: checkReaction };
    const app = createIoriApp({
      federationMiddleware: undefined,
      registerRoutes: (router) => {
        router.route(
          '/api',
          createWorkerSocialActionsApiRouter({
            sendLikeUseCase,
            undoLikeUseCase,
            sendRepostUseCase,
            undoRepostUseCase,
            sendEmojiReactUseCase,
            undoEmojiReactUseCase,
            createContext: () => createMockRequestContext(),
          }),
        );
      },
      serveAsset: async () => undefined,
      serveUpload: async () => undefined,
      serveOgImage: async () => new Response('not implemented', { status: 501 }),
    });

    const requests = [
      ['POST', '/api/v1/like', { postId }],
      ['DELETE', '/api/v1/like', { postId }],
      ['POST', '/api/v1/repost', { postId }],
      ['DELETE', '/api/v1/repost', { postId }],
      ['POST', '/api/v1/react', { postId, emoji: ':wave:' }],
      ['DELETE', '/api/v1/react', { postId, emoji: ':wave:' }],
    ] as const;

    for (const [method, path, body] of requests) {
      const response = await app.request(`https://worker.test${path}`, {
        method,
        headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ success: true });
    }
  });

  it('rejects a social mutation without a valid session cookie', async () => {
    const app = createIoriApp({
      federationMiddleware: undefined,
      registerRoutes: (router) => {
        router.route(
          '/api',
          createWorkerSocialActionsApiRouter({
            sendLikeUseCase: {} as SendLikeUseCase,
            undoLikeUseCase: {} as UndoLikeUseCase,
            sendRepostUseCase: {} as SendRepostUseCase,
            undoRepostUseCase: {} as UndoRepostUseCase,
            sendEmojiReactUseCase: {} as SendEmojiReactUseCase,
            undoEmojiReactUseCase: {} as UndoEmojiReactUseCase,
            createContext: () => createMockRequestContext(),
          }),
        );
      },
      serveAsset: async () => undefined,
      serveUpload: async () => undefined,
      serveOgImage: async () => new Response('not implemented', { status: 501 }),
    });

    const response = await app.request('https://worker.test/api/v1/like', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid session' });
  });
});
