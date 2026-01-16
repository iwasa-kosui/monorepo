import { test as fcTest } from '@fast-check/vitest';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000 });

import { Password } from '../../domain/password/password.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { SignInUseCase } from '../signIn.ts';
import { arbPassword, arbUser, arbUsername } from './helper/arbitraries.ts';
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
    };
  };

  const setupValidUser = (
    deps: ReturnType<typeof createDeps>,
    user: User,
    password: Password,
  ) => {
    deps.userResolverByUsername.setUser(user);
    const hashedPassword = Password.hashPassword(password);
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
      setupValidUser(deps, user, password);

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

    fcTest.prop([arbUser(), arbPassword()], { numRuns: 3 })(
      'プロパティ: 正しいパスワードで認証が成功する',
      async (user, password) => {
        const deps = createDeps();
        setupValidUser(deps, user, password);

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
        }
      },
    );
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
          setupValidUser(deps, user, correctPassword);
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

    it.each([
      { passwordLength: 16, description: '最小長のパスワード' },
      { passwordLength: 50, description: '中程度の長さのパスワード' },
      { passwordLength: 255, description: '最大長のパスワード' },
    ])('$description でも間違ったパスワードは拒否される', async ({ passwordLength }) => {
      const deps = createDeps();
      const user: User = {
        id: crypto.randomUUID() as User['id'],
        username: 'kosui' as Username,
      };
      const correctPassword = 'a'.repeat(passwordLength) as Password;
      const wrongPassword = 'b'.repeat(passwordLength) as Password;
      setupValidUser(deps, user, correctPassword);

      const useCase = SignInUseCase.create(deps);
      const ctx = createMockFedifyContext();

      const result = await useCase.run({
        username: user.username,
        password: wrongPassword,
        ctx,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err.type).toBe('UsernameOrPasswordInvalid');
      }
    });

    fcTest.prop([
      arbUser(),
      arbPassword(),
      arbPassword().filter((p) => p.length >= 16),
    ], { numRuns: 3 })(
      'プロパティ: 異なるパスワードでは認証できない',
      async (user, correctPassword, attemptPassword) => {
        fc.pre(correctPassword !== attemptPassword);

        const deps = createDeps();
        setupValidUser(deps, user, correctPassword);

        const useCase = SignInUseCase.create(deps);
        const ctx = createMockFedifyContext();

        const result = await useCase.run({
          username: user.username,
          password: attemptPassword,
          ctx,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.err.type).toBe('UsernameOrPasswordInvalid');
        }
      },
    );

    fcTest.prop([arbUsername(), arbPassword()])(
      'プロパティ: 存在しないユーザーでは認証できない',
      async (username, password) => {
        const deps = createDeps();
        // ユーザーを登録しない

        const useCase = SignInUseCase.create(deps);
        const ctx = createMockFedifyContext();

        const result = await useCase.run({ username, password, ctx });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.err.type).toBe('UsernameOrPasswordInvalid');
        }
      },
    );
  });

  describe('セッション管理', () => {
    it('サインイン成功時にセッションが作成される', async () => {
      const deps = createDeps();
      const user: User = {
        id: crypto.randomUUID() as User['id'],
        username: 'kosui' as Username,
      };
      const password = 'securepassword1234' as Password;
      setupValidUser(deps, user, password);

      const useCase = SignInUseCase.create(deps);
      const ctx = createMockFedifyContext();

      const result = await useCase.run({
        username: user.username,
        password,
        ctx,
      });

      expect(result.ok).toBe(true);
      expect(deps.sessionStartedStore.store).toHaveBeenCalledTimes(1);

      const storedEvent = deps.sessionStartedStore.items[0];
      expect(storedEvent).toBeDefined();
    });

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
