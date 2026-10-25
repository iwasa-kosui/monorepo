import { describe, expect, it, vi } from 'vitest';

import { SessionId } from '../../../domain/session/sessionId.ts';
import { createWorkerUsersRouter } from '../workerUsersRouter.ts';

describe('createWorkerUsersRouter', () => {
  it('updates logoUri from the local user form and redirects to the profile', async () => {
    const sessionId = SessionId.generate();
    const updateLogoUri = vi.fn(async () => true);
    const app = createWorkerUsersRouter({ updateLogoUri });
    const body = new FormData();
    body.set('logoUri', 'https://cdn.example.invalid/logo.svg');

    const response = await app.request('https://worker.example.invalid/kosui', {
      method: 'POST',
      body,
      headers: { Cookie: `sessionId=${sessionId}` },
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/users/kosui');
    expect(updateLogoUri).toHaveBeenCalledWith({ sessionId, logoUri: 'https://cdn.example.invalid/logo.svg' });
  });
});
