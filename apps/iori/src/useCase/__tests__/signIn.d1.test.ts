import { describe, expect, it } from 'vitest';

import { Password } from '../../domain/password/password.ts';
import { UserId } from '../../domain/user/userId.ts';
import { Username } from '../../domain/user/username.ts';
import { createSignInUseCase } from '../signIn.ts';
import {
  createMockFedifyContext,
  createMockSessionStartedStore,
  createMockUserPasswordResolver,
  createMockUserResolverByUsername,
} from './helper/mockAdaptors.ts';

describe('createSignInUseCase', () => {
  // Real Argon2 hashing and verification can exceed Vitest's default timeout on hosted runners.
  it('runs with injected auth ports', async () => {
    const username = Username.orThrow('kosui');
    const password = Password.orThrow('securepassword1234');
    const userResolverByUsername = createMockUserResolverByUsername();
    const userPasswordResolver = createMockUserPasswordResolver();
    const sessionStartedStore = createMockSessionStartedStore();
    const user = { id: UserId.generate(), username };
    userResolverByUsername.setUser(user);
    userPasswordResolver.setPassword(user.id, Password.hashPassword(password));
    const useCase = createSignInUseCase({
      userResolverByUsername,
      userPasswordResolver,
      sessionStartedStore,
    });

    const result = await useCase.run({
      username,
      password,
      ctx: createMockFedifyContext(),
    });

    expect(result.ok).toBe(true);
    expect(sessionStartedStore.items).toHaveLength(1);
  }, 30_000);
});
