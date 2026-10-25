import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { SessionId } from '../../../domain/session/sessionId.ts';
import { createWorkerPageActionsRouter, createWorkerRemoteFollowRedirectRouter } from '../workerPageActionsRouter.ts';

describe('createWorkerPageActionsRouter', () => {
  it('preserves remote-user follow and unfollow form actions', async () => {
    const followRemoteActor = vi.fn(async () => RA.ok(undefined));
    const unfollowRemoteActor = vi.fn(async () => RA.ok(undefined));
    const actorId = ActorId.generate();
    const sessionId = SessionId.generate();
    const app = new Hono().route(
      '/remote-users',
      createWorkerPageActionsRouter({
        followRemoteActor,
        unfollowRemoteActor,
        createContext: vi.fn(() => ({}) as never),
      }),
    );

    const follow = await app.request(`/remote-users/${actorId}/follow`, {
      method: 'POST',
      headers: { Cookie: `sessionId=${sessionId}` },
    });
    const unfollow = await app.request(`/remote-users/${actorId}/unfollow`, {
      method: 'POST',
      headers: { Cookie: `sessionId=${sessionId}` },
    });

    expect(follow.status).toBe(302);
    expect(unfollow.status).toBe(302);
    expect(follow.headers.get('Location')).toBe(`/remote-users/${actorId}`);
    expect(followRemoteActor).toHaveBeenCalledWith(expect.objectContaining({ actorId, sessionId }));
    expect(unfollowRemoteActor).toHaveBeenCalledWith(expect.objectContaining({ actorId, sessionId }));
  });

  it('redirects an unauthenticated form submission to sign-in', async () => {
    const app = new Hono().route(
      '/remote-users',
      createWorkerPageActionsRouter({
        followRemoteActor: vi.fn(),
        unfollowRemoteActor: vi.fn(),
        createContext: vi.fn(() => ({}) as never),
      }),
    );

    const response = await app.request(`/remote-users/${ActorId.generate()}/follow`, { method: 'POST' });

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/sign-in');
  });

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
