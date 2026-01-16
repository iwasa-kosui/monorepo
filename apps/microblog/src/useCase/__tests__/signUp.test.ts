import { test as fcTest } from '@fast-check/vitest';
import fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000 });

import type { Password } from '../../domain/password/password.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { SignUpUseCase } from '../signUp.ts';
import { arbAcceptableUsername, arbPassword, arbUser, arbUsername } from './helper/arbitraries.ts';
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

    fcTest.prop([arbAcceptableUsername(), arbPassword()], { numRuns: 3 })(
      'プロパティ: 有効なユーザー名とパスワードで登録が成功する',
      async (username, password) => {
        const deps = createDeps();
        const useCase = SignUpUseCase.create(deps);
        const ctx = createMockFedifyContext();

        const result = await useCase.run({ username, password, ctx });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.val.user.username).toBe(username);
        }
      },
    );
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
        });

        fcTest.prop([arbUser(), arbPassword()])(
          'プロパティ: 既存ユーザーと同じユーザー名は登録できない',
          async (existingUser, password) => {
            const deps = createDeps();
            deps.userResolverByUsername.setUser({
              ...existingUser,
              username: 'kosui' as Username,
            });

            const useCase = SignUpUseCase.create(deps);
            const ctx = createMockFedifyContext();

            const result = await useCase.run({
              username: 'kosui' as Username,
              password,
              ctx,
            });

            expect(result.ok).toBe(false);
            if (!result.ok) {
              expect(result.err.type).toBe('UsernameAlreadyTakenError');
            }
          },
        );
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

        fcTest.prop([
          arbUsername().filter((u) => u !== 'kosui'),
          arbPassword(),
        ])(
          'プロパティ: kosui以外のユーザー名は受け付けない',
          async (username, password) => {
            const deps = createDeps();
            const useCase = SignUpUseCase.create(deps);
            const ctx = createMockFedifyContext();

            const result = await useCase.run({ username, password, ctx });

            expect(result.ok).toBe(false);
            if (!result.ok) {
              expect(result.err.type).toBe('UnacceptableUsernameError');
            }
          },
        );
      }
    });
  });

  describe('副作用の検証', () => {
    it.each([
      { storeName: 'userCreatedStore', description: 'ユーザー作成イベントが保存される' },
      { storeName: 'localActorCreatedStore', description: 'ローカルアクター作成イベントが保存される' },
      { storeName: 'userPasswordSetStore', description: 'パスワード設定イベントが保存される' },
    ])('$description', async ({ storeName }) => {
      const deps = createDeps();
      const useCase = SignUpUseCase.create(deps);
      const ctx = createMockFedifyContext();

      await useCase.run({
        username: 'kosui' as Username,
        password: 'securepassword1234' as Password,
        ctx,
      });

      expect(deps[storeName as keyof typeof deps].store).toHaveBeenCalledTimes(1);
    });

    it('登録失敗時はストアが呼ばれない', async () => {
      const deps = createDeps();
      const existingUser: User = {
        id: crypto.randomUUID() as User['id'],
        username: 'kosui' as Username,
      };
      deps.userResolverByUsername.setUser(existingUser);

      const useCase = SignUpUseCase.create(deps);
      const ctx = createMockFedifyContext();

      await useCase.run({
        username: 'kosui' as Username,
        password: 'securepassword1234' as Password,
        ctx,
      });

      expect(deps.userCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.localActorCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.userPasswordSetStore.store).not.toHaveBeenCalled();
    });
  });
});
