import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { createWorkerRemoteFollowRedirectRouter } from '../workerPageActionsRouter.ts';

describe('createWorkerRemoteFollowRedirectRouter', () => {
  it('preserves the remote-follow redirect form action', async () => {
    const app = new Hono().route('/users', createWorkerRemoteFollowRedirectRouter());
    const body = new FormData();
    body.set('handle', '@reader@example.com');

    const response = await app.request('https://blog.test/users/kosui/remote-follow', {
      method: 'POST',
      body,
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(
      'https://example.com/authorize_interaction?uri=https%3A%2F%2Fblog.test%2Fusers%2Fkosui',
    );
  });
});
