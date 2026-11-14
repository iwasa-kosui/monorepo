import { describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000 });

import { nodeArgon2idDerive } from '../../adaptor/argon2/nodeArgon2idDerive.ts';
import { Password } from '../../domain/password/password.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { SignInUseCase } from '../signIn.ts';
import {
  createMockFedifyContext,
  createMockSessionStartedStore,
  createMockUserPasswordResolver,
  createMockUserResolverByUsername,
} from './helper/mockAdaptors.ts';

describe('SignInUseCase', () => {
  const createDeps = () => {
    const userResolverByUsername = createMockUserResolverByUsername();
    const userPasswordResolver = createMockUserPasswordResolver();
    const sessionStartedStore = createMockSessionStartedStore();
    return {
      userResolverByUsername,
      userPasswordResolver,
      sessionStartedStore,
      argon2idDerive: nodeArgon2idDerive,
    };
  };

  const setupValidUser = async (
    deps: ReturnType<typeof createDeps>,
    user: User,
    password: Password,
  ) => {
    deps.userResolverByUsername.setUser(user);
    const hashedPassword = await Password.hashPassword(nodeArgon2idDerive)(password);
    deps.userPasswordResolver.setPassword(user.id, hashedPassword);
  };

  describe('正常系', () => {
    it('正しい認証情報でサインインできる', async () => {
      const deps = createDeps();
      const user: User = {
        id: crypto.randomUUID() as User['id'],
        username: 'kosui' as Username,
      };
      const password = 'securepassword1234' as Password;
      await setupValidUser(deps, user, password);

      const useCase = SignInUseCase.create(deps);
      const ctx = createMockFedifyContext();

      const result = await useCase.run({
        username: user.username,
        password,
        ctx,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.sessionId).toBeDefined();
        expect(deps.sessionStartedStore.store).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('異常系', () => {
    describe.each([
      { scenario: 'ユーザーが存在しない', setupFn: 'noUser' },
      { scenario: 'パスワードが設定されていない', setupFn: 'noPassword' },
      { scenario: 'パスワードが間違っている', setupFn: 'wrongPassword' },
    ])('$scenario 場合', ({ setupFn }) => {
      it('UsernameOrPasswordInvalid エラーを返す', async () => {
        const deps = createDeps();
        const user: User = {
          id: crypto.randomUUID() as User['id'],
          username: 'kosui' as Username,
        };
        const correctPassword = 'securepassword1234' as Password;

        if (setupFn === 'noUser') {
          // ユーザーを登録しない
        } else if (setupFn === 'noPassword') {
          deps.userResolverByUsername.setUser(user);
          // パスワードを設定しない
        } else if (setupFn === 'wrongPassword') {
          await setupValidUser(deps, user, correctPassword);
        }

        const useCase = SignInUseCase.create(deps);
        const ctx = createMockFedifyContext();

        const result = await useCase.run({
          username: user.username,
          password: setupFn === 'wrongPassword' ? 'wrongpassword12345' as Password : correctPassword,
          ctx,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.err.type).toBe('UsernameOrPasswordInvalid');
        }
      });
    });

    it('derive が失敗したときは UsernameOrPasswordInvalid にせず例外として伝える', async () => {
      const deps = createDeps();
      const user: User = {
        id: crypto.randomUUID() as User['id'],
        username: 'kosui' as Username,
      };
      const password = 'securepassword1234' as Password;
      await setupValidUser(deps, user, password);

      const useCase = SignInUseCase.create({
        ...deps,
        argon2idDerive: () => Promise.reject(new Error('derive failed')),
      });

      await expect(useCase.run({ username: user.username, password, ctx: createMockFedifyContext() })).rejects.toThrow(
        'derive failed',
      );
      expect(deps.sessionStartedStore.store).not.toHaveBeenCalled();
    });
  });

  describe('セッション管理', () => {
    it('サインイン失敗時はセッションが作成されない', async () => {
      const deps = createDeps();
      const useCase = SignInUseCase.create(deps);
      const ctx = createMockFedifyContext();

      await useCase.run({
        username: 'nonexistent' as Username,
        password: 'securepassword1234' as Password,
        ctx,
      });

      expect(deps.sessionStartedStore.store).not.toHaveBeenCalled();
    });
  });
});
