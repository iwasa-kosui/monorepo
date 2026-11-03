import { RA } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { createIoriApp } from '../../../appFactory.tsx';
import { createMockRequestContext } from '../../../useCase/__tests__/helper/mockAdaptors.ts';
import type { SendEmojiReactUseCase } from '../../../useCase/sendEmojiReact.ts';
import type { UndoEmojiReactUseCase } from '../../../useCase/undoEmojiReact.ts';
import { createWorkerSocialActionsApiRouter } from '../workerSocialActionsApiRouter.ts';

const sessionCookie = 'sessionId=4dc530d6-d06c-4b4a-a021-0e1aee0b6d82';
const postId = '573c7c51-0e4b-453c-bb9f-5dbd15a319a7';

describe('createWorkerSocialActionsApiRouter', () => {
  it('serves authenticated emoji reaction mutations and no longer serves like or repost', async () => {
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
      ['POST', '/api/v1/react', { postId, emoji: ':wave:' }, 200],
      ['DELETE', '/api/v1/react', { postId, emoji: ':wave:' }, 200],
      ['POST', '/api/v1/like', { postId }, 404],
      ['DELETE', '/api/v1/like', { postId }, 404],
      ['POST', '/api/v1/repost', { postId }, 404],
      ['DELETE', '/api/v1/repost', { postId }, 404],
    ] as const;

    for (const [method, path, body, status] of requests) {
      const response = await app.request(`https://worker.test${path}`, {
        method,
        headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(status);
      if (status === 200) await expect(response.json()).resolves.toEqual({ success: true });
    }
  });

  it('rejects an emoji reaction without a valid session cookie', async () => {
    const app = createIoriApp({
      federationMiddleware: undefined,
      registerRoutes: (router) => {
        router.route(
          '/api',
          createWorkerSocialActionsApiRouter({
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

    const response = await app.request('https://worker.test/api/v1/react', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId, emoji: ':wave:' }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid session' });
  });
});
