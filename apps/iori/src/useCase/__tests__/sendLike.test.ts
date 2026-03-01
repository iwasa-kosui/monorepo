import { test as fcTest } from '@fast-check/vitest';
import { describe, expect, it, vi } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { AlreadyLikedError, LocalLike } from '../../domain/like/like.ts';
import type { LikeId } from '../../domain/like/likeId.ts';
import type { LocalPost } from '../../domain/post/post.ts';
import type { PostId } from '../../domain/post/postId.ts';
import type { Session } from '../../domain/session/session.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { SendLikeUseCase } from '../sendLike.ts';
import { arbSessionId } from './helper/arbitraries.ts';
import {
  createMockActorResolverByUserId,
  createMockLikeResolver,
  createMockLocalLikeCreatedStore,
  createMockPostResolver,
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
    const localLikeCreatedStore = createMockLocalLikeCreatedStore();
    const likeResolver = createMockLikeResolver();
    const postResolver = createMockPostResolver();
    return {
      sessionResolver,
      userResolver,
      actorResolverByUserId,
      localLikeCreatedStore,
      likeResolver,
      postResolver,
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
        postId: crypto.randomUUID() as PostId,
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
        postId: crypto.randomUUID() as PostId,
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
        postId: crypto.randomUUID() as PostId,
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

      const post: LocalPost = {
        type: 'local',
        postId: crypto.randomUUID() as PostId,
        actorId: actor.id,
        content: 'Test post',
        createdAt: Date.now() as LocalPost['createdAt'],
        userId: user.id,
        inReplyToUri: null,
      };
      deps.postResolver.setPost(post);

      const existingLike: LocalLike = {
        type: 'local',
        likeId: crypto.randomUUID() as LikeId,
        actorId: actor.id,
        postId: post.postId,
      };
      deps.likeResolver.setLike(existingLike);

      const useCase = SendLikeUseCase.create(deps);
      const ctx = createMockRequestContext();

      const result = await useCase.run({
        sessionId: session.sessionId,
        postId: post.postId,
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
          postId: crypto.randomUUID() as PostId,
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
        postId: crypto.randomUUID() as PostId,
        request: new Request('https://example.com'),
        ctx,
      });

      expect(deps.localLikeCreatedStore.store).not.toHaveBeenCalled();
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

      const post: LocalPost = {
        type: 'local',
        postId: crypto.randomUUID() as PostId,
        actorId: actor.id,
        content: 'Test post',
        createdAt: Date.now() as LocalPost['createdAt'],
        userId: user.id,
        inReplyToUri: null,
      };
      deps.postResolver.setPost(post);

      const existingLike: LocalLike = {
        type: 'local',
        likeId: crypto.randomUUID() as LikeId,
        actorId: actor.id,
        postId: post.postId,
      };
      deps.likeResolver.setLike(existingLike);

      const useCase = SendLikeUseCase.create(deps);
      const ctx = createMockRequestContext();

      await useCase.run({
        sessionId: session.sessionId,
        postId: post.postId,
        request: new Request('https://example.com'),
        ctx,
      });

      expect(deps.localLikeCreatedStore.store).not.toHaveBeenCalled();
    });
  });

  describe('冪等性の検証', () => {
    it('同じ投稿に2回いいねすると AlreadyLikedError を返す', async () => {
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

      const post: LocalPost = {
        type: 'local',
        postId: crypto.randomUUID() as PostId,
        actorId: actor.id,
        content: 'Test post',
        createdAt: Date.now() as LocalPost['createdAt'],
        userId: user.id,
        inReplyToUri: null,
      };
      deps.postResolver.setPost(post);

      const existingLike: LocalLike = {
        type: 'local',
        likeId: crypto.randomUUID() as LikeId,
        actorId: actor.id,
        postId: post.postId,
      };
      deps.likeResolver.setLike(existingLike);

      const useCase = SendLikeUseCase.create(deps);
      const ctx = createMockRequestContext();

      const result = await useCase.run({
        sessionId: session.sessionId,
        postId: post.postId,
        request: new Request('https://example.com'),
        ctx,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err.type).toBe('AlreadyLikedError');
        const err = result.err as AlreadyLikedError;
        expect(err.detail.actorId).toBe(actor.id);
        expect(err.detail.postId).toBe(post.postId);
      }
    });
  });
});
