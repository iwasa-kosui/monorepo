import { test as fcTest } from '@fast-check/vitest';
import { describe, expect, it, vi } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { Session } from '../../domain/session/session.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { CreatePostUseCase } from '../createPost.ts';
import { arbContent, arbImageUrls, arbSessionId, arbUser } from './helper/arbitraries.ts';
import {
  createMockActorResolverByUserId,
  createMockLinkPreviewCreatedStore,
  createMockOgpFetcher,
  createMockPostCreatedStore,
  createMockPostImageCreatedStore,
  createMockRequestContext,
  createMockSessionResolver,
  createMockTimelineItemCreatedStore,
  createMockUserResolver,
} from './helper/mockAdaptors.ts';

vi.mock('../../env.ts', () => ({
  Env: {
    getInstance: () => ({
      ORIGIN: 'https://example.com',
    }),
  },
}));

describe('CreatePostUseCase', () => {
  const createDeps = () => {
    const sessionResolver = createMockSessionResolver();
    const postCreatedStore = createMockPostCreatedStore();
    const userResolver = createMockUserResolver();
    const actorResolverByUserId = createMockActorResolverByUserId();
    const postImageCreatedStore = createMockPostImageCreatedStore();
    const timelineItemCreatedStore = createMockTimelineItemCreatedStore();
    const linkPreviewCreatedStore = createMockLinkPreviewCreatedStore();
    const ogpFetcher = createMockOgpFetcher();
    return {
      sessionResolver,
      postCreatedStore,
      userResolver,
      actorResolverByUserId,
      postImageCreatedStore,
      timelineItemCreatedStore,
      linkPreviewCreatedStore,
      ogpFetcher,
    };
  };

  const setupValidUserSession = (
    deps: ReturnType<typeof createDeps>,
    user: User,
    session: Session,
    actor: LocalActor,
  ) => {
    const validSession: Session = {
      ...session,
      userId: user.id,
    };
    deps.sessionResolver.setSession(validSession);
    deps.userResolver.setUser(user);
    deps.actorResolverByUserId.setActor({
      ...actor,
      userId: user.id,
    });
    return validSession;
  };

  describe('正常系', () => {
    it('投稿を作成できる', async () => {
      const deps = createDeps();
      const user: User = {
        id: crypto.randomUUID() as User['id'],
        username: 'kosui' as Username,
      };
      const session: Session = {
        sessionId: crypto.randomUUID() as Session['sessionId'],
        userId: user.id,
        expires: (Date.now() + 1000 * 60 * 60 * 24) as Session['expires'],
      };
      const actor: LocalActor = {
        id: crypto.randomUUID() as LocalActor['id'],
        userId: user.id,
        uri: 'https://example.com/users/kosui',
        inboxUrl: 'https://example.com/inbox',
        type: 'local',
        logoUri: undefined,
      };
      setupValidUserSession(deps, user, session, actor);

      const useCase = CreatePostUseCase.create(deps);
      const ctx = createMockRequestContext();

      const result = await useCase.run({
        sessionId: session.sessionId,
        content: 'Hello, world!',
        imageUrls: [],
        ctx,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.post.content).toBe('Hello, world!');
        expect(result.val.user.username).toBe('kosui');
        expect(deps.postCreatedStore.store).toHaveBeenCalledTimes(1);
      }
    });

    it.each([
      { imageCount: 0, description: '画像なし' },
      { imageCount: 1, description: '画像1枚' },
      { imageCount: 4, description: '画像4枚' },
    ])('$description で投稿を作成できる', async ({ imageCount }) => {
      const deps = createDeps();
      const user: User = {
        id: crypto.randomUUID() as User['id'],
        username: 'kosui' as Username,
      };
      const session: Session = {
        sessionId: crypto.randomUUID() as Session['sessionId'],
        userId: user.id,
        expires: (Date.now() + 1000 * 60 * 60 * 24) as Session['expires'],
      };
      const actor: LocalActor = {
        id: crypto.randomUUID() as LocalActor['id'],
        userId: user.id,
        uri: 'https://example.com/users/kosui',
        inboxUrl: 'https://example.com/inbox',
        type: 'local',
        logoUri: undefined,
      };
      setupValidUserSession(deps, user, session, actor);

      const useCase = CreatePostUseCase.create(deps);
      const ctx = createMockRequestContext();
      const imageUrls = Array.from({ length: imageCount }, (_, i) => `https://example.com/image${i}.png`);

      const result = await useCase.run({
        sessionId: session.sessionId,
        content: 'Test post with images',
        imageUrls,
        ctx,
      });

      expect(result.ok).toBe(true);
      if (imageCount > 0) {
        expect(deps.postImageCreatedStore.store).toHaveBeenCalledTimes(1);
      } else {
        expect(deps.postImageCreatedStore.store).not.toHaveBeenCalled();
      }
    });

    fcTest.prop([
      arbUser(),
      arbContent(),
      arbImageUrls(),
    ])(
      'プロパティ: 有効なセッションで任意のコンテンツを投稿できる',
      async (user, content, imageUrls) => {
        const deps = createDeps();
        const session = {
          sessionId: crypto.randomUUID() as Session['sessionId'],
          userId: user.id,
          expires: (Date.now() + 1000 * 60 * 60 * 24) as Session['expires'],
        };
        const actor: LocalActor = {
          id: crypto.randomUUID() as LocalActor['id'],
          userId: user.id,
          uri: 'https://example.com/users/test',
          inboxUrl: 'https://example.com/inbox',
          type: 'local',
          logoUri: undefined,
        };
        setupValidUserSession(deps, user, session, actor);

        const useCase = CreatePostUseCase.create(deps);
        const ctx = createMockRequestContext();

        const result = await useCase.run({
          sessionId: session.sessionId,
          content,
          imageUrls,
          ctx,
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.val.post.content).toBe(content);
          expect(result.val.user.id).toBe(user.id);
        }
      },
    );
  });

  describe('異常系', () => {
    describe.each([
      { errorType: 'SessionExpiredError', description: 'セッションが期限切れの場合' },
      { errorType: 'SessionNotFound', description: 'セッションが存在しない場合' },
      { errorType: 'UserNotFoundError', description: 'ユーザーが存在しない場合' },
    ])('$description', ({ errorType }) => {
      if (errorType === 'SessionExpiredError') {
        it('SessionExpiredError を返す', async () => {
          const deps = createDeps();
          const userId = crypto.randomUUID() as User['id'];
          const expiredSession: Session = {
            sessionId: crypto.randomUUID() as Session['sessionId'],
            userId,
            expires: (Date.now() - 1000) as Session['expires'],
          };
          deps.sessionResolver.setSession(expiredSession);

          const useCase = CreatePostUseCase.create(deps);
          const ctx = createMockRequestContext();

          const result = await useCase.run({
            sessionId: expiredSession.sessionId,
            content: 'Test',
            imageUrls: [],
            ctx,
          });

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.err.type).toBe('SessionExpiredError');
          }
        });
      }

      if (errorType === 'SessionNotFound') {
        it('SessionExpiredError を返す（セッション不在）', async () => {
          const deps = createDeps();
          const useCase = CreatePostUseCase.create(deps);
          const ctx = createMockRequestContext();

          const result = await useCase.run({
            sessionId: crypto.randomUUID() as Session['sessionId'],
            content: 'Test',
            imageUrls: [],
            ctx,
          });

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.err.type).toBe('SessionExpiredError');
          }
        });

        fcTest.prop([arbSessionId()])(
          'プロパティ: 存在しないセッションIDでは投稿できない',
          async (sessionId) => {
            const deps = createDeps();
            const useCase = CreatePostUseCase.create(deps);
            const ctx = createMockRequestContext();

            const result = await useCase.run({
              sessionId,
              content: 'Test',
              imageUrls: [],
              ctx,
            });

            expect(result.ok).toBe(false);
            if (!result.ok) {
              expect(result.err.type).toBe('SessionExpiredError');
            }
          },
        );
      }

      if (errorType === 'UserNotFoundError') {
        it('UserNotFoundError を返す', async () => {
          const deps = createDeps();
          const session: Session = {
            sessionId: crypto.randomUUID() as Session['sessionId'],
            userId: crypto.randomUUID() as User['id'],
            expires: (Date.now() + 1000 * 60 * 60 * 24) as Session['expires'],
          };
          deps.sessionResolver.setSession(session);
          // ユーザーは登録しない

          const useCase = CreatePostUseCase.create(deps);
          const ctx = createMockRequestContext();

          const result = await useCase.run({
            sessionId: session.sessionId,
            content: 'Test',
            imageUrls: [],
            ctx,
          });

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.err.type).toBe('UserNotFoundError');
          }
        });
      }
    });
  });

  describe('副作用の検証', () => {
    it.each(
      [
        { storeName: 'postCreatedStore', description: '投稿作成イベントが保存される' },
      ] as const,
    )('$description', async ({ storeName }) => {
      const deps = createDeps();
      const user: User = {
        id: crypto.randomUUID() as User['id'],
        username: 'kosui' as Username,
      };
      const session: Session = {
        sessionId: crypto.randomUUID() as Session['sessionId'],
        userId: user.id,
        expires: (Date.now() + 1000 * 60 * 60 * 24) as Session['expires'],
      };
      const actor: LocalActor = {
        id: crypto.randomUUID() as LocalActor['id'],
        userId: user.id,
        uri: 'https://example.com/users/kosui',
        inboxUrl: 'https://example.com/inbox',
        type: 'local',
        logoUri: undefined,
      };
      setupValidUserSession(deps, user, session, actor);

      const useCase = CreatePostUseCase.create(deps);
      const ctx = createMockRequestContext();

      await useCase.run({
        sessionId: session.sessionId,
        content: 'Test post',
        imageUrls: [],
        ctx,
      });

      expect(deps[storeName].store).toHaveBeenCalledTimes(1);
    });

    it('作成失敗時はストアが呼ばれない', async () => {
      const deps = createDeps();
      const useCase = CreatePostUseCase.create(deps);
      const ctx = createMockRequestContext();

      await useCase.run({
        sessionId: crypto.randomUUID() as Session['sessionId'],
        content: 'Test',
        imageUrls: [],
        ctx,
      });

      expect(deps.postCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.postImageCreatedStore.store).not.toHaveBeenCalled();
    });
  });

  describe('ActivityPub連携', () => {
    it('投稿作成時にActivityが送信される', async () => {
      const deps = createDeps();
      const user: User = {
        id: crypto.randomUUID() as User['id'],
        username: 'kosui' as Username,
      };
      const session: Session = {
        sessionId: crypto.randomUUID() as Session['sessionId'],
        userId: user.id,
        expires: (Date.now() + 1000 * 60 * 60 * 24) as Session['expires'],
      };
      const actor: LocalActor = {
        id: crypto.randomUUID() as LocalActor['id'],
        userId: user.id,
        uri: 'https://example.com/users/kosui',
        inboxUrl: 'https://example.com/inbox',
        type: 'local',
        logoUri: undefined,
      };
      setupValidUserSession(deps, user, session, actor);

      const useCase = CreatePostUseCase.create(deps);
      const ctx = createMockRequestContext();

      await useCase.run({
        sessionId: session.sessionId,
        content: 'Hello ActivityPub!',
        imageUrls: [],
        ctx,
      });

      expect(ctx.sendActivity).toHaveBeenCalled();
    });
  });
});
