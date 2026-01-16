import { test as fcTest } from '@fast-check/vitest';
import { describe, expect, it, vi } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { Like } from '../../domain/like/like.ts';
import type { LikeId } from '../../domain/like/likeId.ts';
import type { Session } from '../../domain/session/session.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { SendLikeUseCase } from '../sendLike.ts';
import { arbSessionId } from './helper/arbitraries.ts';
import {
  createMockActorResolverByUserId,
  createMockLikeCreatedStore,
  createMockLikeResolver,
  createMockRequestContext,
  createMockSessionResolver,
  createMockUserResolver,
} from './helper/mockAdaptors.ts';

vi.mock('../../federation.ts', () => ({
  Federation: {
    getInstance: () => ({
      createContext: () => ({
        getDocumentLoader: vi.fn().mockResolvedValue({}),
        lookupObject: vi.fn().mockResolvedValue(null),
      }),
    }),
  },
}));

describe('SendLikeUseCase', () => {
  const createDeps = () => {
    const sessionResolver = createMockSessionResolver();
    const userResolver = createMockUserResolver();
    const actorResolverByUserId = createMockActorResolverByUserId();
    const likeCreatedStore = createMockLikeCreatedStore();
    const likeResolver = createMockLikeResolver();
    return {
      sessionResolver,
      userResolver,
      actorResolverByUserId,
      likeCreatedStore,
      likeResolver,
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

  describe('異常系', () => {
    it('セッションが期限切れの場合 SessionExpiredError を返す', async () => {
      const deps = createDeps();
      const userId = crypto.randomUUID() as User['id'];
      const expiredSession: Session = {
        sessionId: crypto.randomUUID() as Session['sessionId'],
        userId,
        expires: (Date.now() - 1000) as Session['expires'],
      };
      deps.sessionResolver.setSession(expiredSession);

      const useCase = SendLikeUseCase.create(deps);
      const ctx = createMockRequestContext();

      const result = await useCase.run({
        sessionId: expiredSession.sessionId,
        objectUri: 'https://remote.example.com/posts/1',
        request: new Request('https://example.com'),
        ctx,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err.type).toBe('SessionExpiredError');
      }
    });

    it('セッションが存在しない場合 SessionExpiredError を返す', async () => {
      const deps = createDeps();

      const useCase = SendLikeUseCase.create(deps);
      const ctx = createMockRequestContext();

      const result = await useCase.run({
        sessionId: crypto.randomUUID() as Session['sessionId'],
        objectUri: 'https://remote.example.com/posts/1',
        request: new Request('https://example.com'),
        ctx,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err.type).toBe('SessionExpiredError');
      }
    });

    it('ユーザーが存在しない場合 UserNotFoundError を返す', async () => {
      const deps = createDeps();
      const session: Session = {
        sessionId: crypto.randomUUID() as Session['sessionId'],
        userId: crypto.randomUUID() as User['id'],
        expires: (Date.now() + 1000 * 60 * 60 * 24) as Session['expires'],
      };
      deps.sessionResolver.setSession(session);

      const useCase = SendLikeUseCase.create(deps);
      const ctx = createMockRequestContext();

      const result = await useCase.run({
        sessionId: session.sessionId,
        objectUri: 'https://remote.example.com/posts/1',
        request: new Request('https://example.com'),
        ctx,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err.type).toBe('UserNotFoundError');
      }
    });

    it('既にいいねしている場合 AlreadyLikedError を返す', async () => {
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

      const objectUri = 'https://remote.example.com/posts/1';
      const existingLike: Like = {
        likeId: crypto.randomUUID() as LikeId,
        actorId: actor.id,
        objectUri,
      };
      deps.likeResolver.setLike(existingLike);

      const useCase = SendLikeUseCase.create(deps);
      const ctx = createMockRequestContext();

      const result = await useCase.run({
        sessionId: session.sessionId,
        objectUri,
        request: new Request('https://example.com'),
        ctx,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err.type).toBe('AlreadyLikedError');
      }
    });

    fcTest.prop([arbSessionId()])(
      'プロパティ: 存在しないセッションIDではいいねを送れない',
      async (sessionId) => {
        const deps = createDeps();
        const useCase = SendLikeUseCase.create(deps);
        const ctx = createMockRequestContext();

        const result = await useCase.run({
          sessionId,
          objectUri: 'https://remote.example.com/posts/1',
          request: new Request('https://example.com'),
          ctx,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.err.type).toBe('SessionExpiredError');
        }
      },
    );
  });

  describe('副作用の検証', () => {
    it('セッション認証失敗時は likeCreatedStore が呼ばれない', async () => {
      const deps = createDeps();

      const useCase = SendLikeUseCase.create(deps);
      const ctx = createMockRequestContext();

      await useCase.run({
        sessionId: crypto.randomUUID() as Session['sessionId'],
        objectUri: 'https://remote.example.com/posts/1',
        request: new Request('https://example.com'),
        ctx,
      });

      expect(deps.likeCreatedStore.store).not.toHaveBeenCalled();
    });

    it('AlreadyLikedError の場合 likeCreatedStore が呼ばれない', async () => {
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

      const objectUri = 'https://remote.example.com/posts/1';
      const existingLike: Like = {
        likeId: crypto.randomUUID() as LikeId,
        actorId: actor.id,
        objectUri,
      };
      deps.likeResolver.setLike(existingLike);

      const useCase = SendLikeUseCase.create(deps);
      const ctx = createMockRequestContext();

      await useCase.run({
        sessionId: session.sessionId,
        objectUri,
        request: new Request('https://example.com'),
        ctx,
      });

      expect(deps.likeCreatedStore.store).not.toHaveBeenCalled();
    });
  });

  describe('冪等性の検証', () => {
    it('同じオブジェクトに2回いいねすると AlreadyLikedError を返す', async () => {
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

      const objectUri = 'https://remote.example.com/posts/1';
      const existingLike: Like = {
        likeId: crypto.randomUUID() as LikeId,
        actorId: actor.id,
        objectUri,
      };
      deps.likeResolver.setLike(existingLike);

      const useCase = SendLikeUseCase.create(deps);
      const ctx = createMockRequestContext();

      const result = await useCase.run({
        sessionId: session.sessionId,
        objectUri,
        request: new Request('https://example.com'),
        ctx,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err.type).toBe('AlreadyLikedError');
        expect(result.err.detail.actorId).toBe(actor.id);
        expect(result.err.detail.objectUri).toBe(objectUri);
      }
    });
  });
});
