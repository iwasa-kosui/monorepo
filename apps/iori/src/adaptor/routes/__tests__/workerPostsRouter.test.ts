import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { SessionExpiredError } from '../../../domain/session/session.ts';
import { SessionId } from '../../../domain/session/sessionId.ts';
import { createMockRequestContext } from '../../../useCase/__tests__/helper/mockAdaptors.ts';
import type { CreatePostUseCase } from '../../../useCase/createPost.ts';
import { createWorkerPostsRouter } from '../workerPostsRouter.tsx';

const formRequest = (fields: Record<string, string>, headers: Record<string, string> = {}) => {
  const body = new URLSearchParams(fields);
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body,
  };
};

const createApp = (run: CreatePostUseCase['run']) =>
  new Hono().route(
    '/posts',
    createWorkerPostsRouter({
      createPostUseCase: { run },
      createContext: () => createMockRequestContext(),
    }),
  );

describe('createWorkerPostsRouter', () => {
  it('creates a post from the form submission and redirects to the home page', async () => {
    const run = vi.fn<CreatePostUseCase['run']>(async () => RA.ok({} as never));
    const sessionId = SessionId.generate();

    const response = await createApp(run).request(
      '/posts',
      formRequest({ content: 'Hello **Worker**', imageUrls: 'https://worker.test/a.png,,https://worker.test/b.png' }, {
        Cookie: `sessionId=${sessionId}`,
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/');
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        content: expect.stringContaining('<strong>Worker</strong>'),
        imageUrls: ['https://worker.test/a.png', 'https://worker.test/b.png'],
      }),
    );
  });

  it('passes an empty image list when imageUrls is omitted', async () => {
    const run = vi.fn<CreatePostUseCase['run']>(async () => RA.ok({} as never));

    await createApp(run).request(
      '/posts',
      formRequest({ content: 'No images' }, { Cookie: `sessionId=${SessionId.generate()}` }),
    );

    expect(run).toHaveBeenCalledWith(expect.objectContaining({ imageUrls: [] }));
  });

  it('renders the sign-in error page without calling the use case when the session cookie is missing', async () => {
    const run = vi.fn<CreatePostUseCase['run']>();

    const response = await createApp(run).request('/posts', formRequest({ content: 'Hello' }));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('Please sign in to create a post.');
    expect(run).not.toHaveBeenCalled();
  });

  it('renders the use case error page', async () => {
    const run = vi.fn<CreatePostUseCase['run']>(async () => RA.err(SessionExpiredError.create(SessionId.generate())));

    const response = await createApp(run).request(
      '/posts',
      formRequest({ content: 'Hello' }, { Cookie: `sessionId=${SessionId.generate()}` }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<h1>Error</h1>');
  });

  it('rejects an empty content', async () => {
    const run = vi.fn<CreatePostUseCase['run']>();

    const response = await createApp(run).request(
      '/posts',
      formRequest({ content: '' }, { Cookie: `sessionId=${SessionId.generate()}` }),
    );

    expect(response.status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });
});
