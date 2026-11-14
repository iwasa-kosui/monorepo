import { describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000 });

import { nobleArgon2idDerive } from '../../domain/password/argon2idDerive.ts';
import type { Password } from '../../domain/password/password.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { SignUpUseCase } from '../signUp.ts';
import {
  createMockFedifyContext,
  createMockLocalActorCreatedStore,
  createMockUserCreatedStore,
  createMockUserPasswordSetStore,
  createMockUserResolverByUsername,
} from './helper/mockAdaptors.ts';

describe('SignUpUseCase', () => {
  const createDeps = () => {
    const userResolverByUsername = createMockUserResolverByUsername();
    const userCreatedStore = createMockUserCreatedStore();
    const localActorCreatedStore = createMockLocalActorCreatedStore();
    const userPasswordSetStore = createMockUserPasswordSetStore();
    return {
      userResolverByUsername,
      userCreatedStore,
      localActorCreatedStore,
      userPasswordSetStore,
      argon2idDerive: nobleArgon2idDerive,
    };
  };

  describe('正常系', () => {
    it('新規ユーザー登録が成功する', async () => {
      const deps = createDeps();
      const useCase = SignUpUseCase.create(deps);
      const ctx = createMockFedifyContext();

      const result = await useCase.run({
        username: 'kosui' as Username,
        password: 'securepassword1234' as Password,
        ctx,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.user.username).toBe('kosui');
        expect(deps.userCreatedStore.store).toHaveBeenCalledTimes(1);
        expect(deps.localActorCreatedStore.store).toHaveBeenCalledTimes(1);
        expect(deps.userPasswordSetStore.store).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('異常系', () => {
    describe.each([
      { errorType: 'UsernameAlreadyTakenError', description: 'ユーザー名が既に使用されている場合' },
      { errorType: 'UnacceptableUsernameError', description: '許可されていないユーザー名の場合' },
    ])('$description', ({ errorType }) => {
      if (errorType === 'UsernameAlreadyTakenError') {
        it('UsernameAlreadyTakenError を返す', async () => {
          const deps = createDeps();
          const existingUser: User = {
            id: crypto.randomUUID() as User['id'],
            username: 'kosui' as Username,
          };
          deps.userResolverByUsername.setUser(existingUser);

          const useCase = SignUpUseCase.create(deps);
          const ctx = createMockFedifyContext();

          const result = await useCase.run({
            username: 'kosui' as Username,
            password: 'securepassword1234' as Password,
            ctx,
          });

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.err.type).toBe('UsernameAlreadyTakenError');
          }
          expect(deps.userCreatedStore.store).not.toHaveBeenCalled();
          expect(deps.localActorCreatedStore.store).not.toHaveBeenCalled();
          expect(deps.userPasswordSetStore.store).not.toHaveBeenCalled();
        });
      }

      if (errorType === 'UnacceptableUsernameError') {
        it.each([
          { username: 'admin', reason: '予約済みのユーザー名' },
          { username: 'test_user', reason: 'kosui以外のユーザー名' },
          { username: 'another', reason: 'kosui以外のユーザー名' },
        ])('$reason ($username) の場合、UnacceptableUsernameError を返す', async ({ username }) => {
          const deps = createDeps();
          const useCase = SignUpUseCase.create(deps);
          const ctx = createMockFedifyContext();

          const result = await useCase.run({
            username: username as Username,
            password: 'securepassword1234' as Password,
            ctx,
          });

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.err.type).toBe('UnacceptableUsernameError');
          }
        });
      }
    });
  });
});
