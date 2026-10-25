import { describe, expect, it } from 'vitest';

import { UserId } from './domain/user/userId.ts';
import { createWorkerPageFallback } from './workerPageFallback.ts';

describe('createWorkerPageFallback', () => {
  it('renders mapped client entries and the resolved session identity', async () => {
    const userId = UserId.generate();
    const response = await createWorkerPageFallback(
      new Request('https://worker.test/users/kosui/posts/01989332-d1c1-7dd1-9ed7-886b8857dffa'),
      { isLoggedIn: true, userId },
    );

    expect(response?.status).toBe(200);
    const html = await response?.text();
    expect(html).toContain('/static/localPost.js');
    expect(html).toContain('data-is-logged-in="true"');
    expect(html).toContain(`data-user-id="${userId}"`);
  });

  it('does not claim unknown GET routes', async () => {
    const response = await createWorkerPageFallback(new Request('https://worker.test/not-a-page'));
    expect(response).toBeUndefined();
  });
});
