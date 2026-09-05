import { describe, expect, it } from 'vitest';

import { Password } from '../../../domain/password/password.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { Username } from '../../../domain/user/username.ts';
import {
  createMockFedifyContext,
  createMockSessionStartedStore,
  createMockUserPasswordResolver,
  createMockUserResolverByUsername,
} from '../../../useCase/__tests__/helper/mockAdaptors.ts';
import { createSignInUseCase } from '../../../useCase/signIn.ts';
import { createWorkerAuthApiRouter } from '../workerAuthApiRouter.ts';

describe('createWorkerAuthApiRouter', () => {
  it('runs sign-in and sets a session cookie for the Worker API path', async () => {
    const username = Username.orThrow('kosui');
    const password = Password.orThrow('securepassword1234');
    const userResolverByUsername = createMockUserResolverByUsername();
    const userPasswordResolver = createMockUserPasswordResolver();
    const sessionStartedStore = createMockSessionStartedStore();
    const user = { id: UserId.generate(), username };
    userResolverByUsername.setUser(user);
    userPasswordResolver.setPassword(user.id, Password.hashPassword(password));
    const app = createWorkerAuthApiRouter({
      signInUseCase: createSignInUseCase({
        userResolverByUsername,
        userPasswordResolver,
        sessionStartedStore,
      }),
      createContext: () => createMockFedifyContext(),
    });

    const response = await app.request('http://worker.test/v1/sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(response.headers.get('set-cookie')).toContain('sessionId=');
    expect(sessionStartedStore.items).toHaveLength(1);
  });
});
