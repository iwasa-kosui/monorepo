import { test as fcTest } from '@fast-check/vitest';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { Session } from '../../domain/session/session.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { SendFollowRequestUseCase } from '../sendFollowRequest.ts';
import { arbSessionId } from './helper/arbitraries.ts';
import {
  createMockActorResolverByUri,
  createMockActorResolverByUserId,
  createMockFollowRequestedStore,
  createMockLogoUriUpdatedStore,
  createMockRemoteActorCreatedStore,
  createMockRequestContext,
  createMockSessionResolver,
  createMockUserResolver,
} from './helper/mockAdaptors.ts';

describe('SendFollowRequestUseCase', () => {
  const createMockRemoteActorLookup = () => ({
    lookup: vi.fn().mockImplementation(() =>
      RA.err({
        type: 'RemoteActorLookupError',
        message: 'Mock lookup error',
        detail: { handle: 'test@example.com' },
      })
    ),
  });

  const createDeps = () => {
    const sessionResolver = createMockSessionResolver();
    const userResolver = createMockUserResolver();
    const actorResolverByUserId = createMockActorResolverByUserId();
    const remoteActorLookup = createMockRemoteActorLookup();
    const followRequestedStore = createMockFollowRequestedStore();
    const remoteActorCreatedStore = createMockRemoteActorCreatedStore();
    const logoUriUpdatedStore = createMockLogoUriUpdatedStore();
    const actorResolverByUri = createMockActorResolverByUri();
    return {
      sessionResolver,
      userResolver,
      actorResolverByUserId,
      remoteActorLookup,
      followRequestedStore,
      remoteActorCreatedStore,
      logoUriUpdatedStore,
      actorResolverByUri,
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

      const useCase = SendFollowRequestUseCase.create(deps);
      const ctx = createMockRequestContext();

      const result = await useCase.run({
        sessionId: expiredSession.sessionId,
        handle: 'user@remote.example.com',
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

      const useCase = SendFollowRequestUseCase.create(deps);
      const ctx = createMockRequestContext();

      const result = await useCase.run({
        sessionId: crypto.randomUUID() as Session['sessionId'],
        handle: 'user@remote.example.com',
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

      const useCase = SendFollowRequestUseCase.create(deps);
      const ctx = createMockRequestContext();

      const result = await useCase.run({
        sessionId: session.sessionId,
        handle: 'user@remote.example.com',
        request: new Request('https://example.com'),
        ctx,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err.type).toBe('UserNotFoundError');
      }
    });

    it('リモートアクターが見つからない場合 RemoteActorLookupError を返す', async () => {
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

      const useCase = SendFollowRequestUseCase.create(deps);
      const ctx = createMockRequestContext();

      const result = await useCase.run({
        sessionId: session.sessionId,
        handle: 'nonexistent@remote.example.com',
        request: new Request('https://example.com'),
        ctx,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err.type).toBe('RemoteActorLookupError');
      }
    });

    fcTest.prop([arbSessionId()])(
      'プロパティ: 存在しないセッションIDではフォローリクエストを送れない',
      async (sessionId) => {
        const deps = createDeps();
        const useCase = SendFollowRequestUseCase.create(deps);
        const ctx = createMockRequestContext();

        const result = await useCase.run({
          sessionId,
          handle: 'user@remote.example.com',
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
    it('セッション認証失敗時は followRequestedStore が呼ばれない', async () => {
      const deps = createDeps();

      const useCase = SendFollowRequestUseCase.create(deps);
      const ctx = createMockRequestContext();

      await useCase.run({
        sessionId: crypto.randomUUID() as Session['sessionId'],
        handle: 'user@remote.example.com',
        request: new Request('https://example.com'),
        ctx,
      });

      expect(deps.followRequestedStore.store).not.toHaveBeenCalled();
    });

    it('リモートアクター検索失敗時は followRequestedStore が呼ばれない', async () => {
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

      const useCase = SendFollowRequestUseCase.create(deps);
      const ctx = createMockRequestContext();

      await useCase.run({
        sessionId: session.sessionId,
        handle: 'user@remote.example.com',
        request: new Request('https://example.com'),
        ctx,
      });

      expect(deps.followRequestedStore.store).not.toHaveBeenCalled();
    });
  });
});
