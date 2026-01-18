import { test as fcTest } from '@fast-check/vitest';
import { describe, expect, it, vi } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { LocalPost, RemotePost } from '../../domain/post/post.ts';
import type { PostId } from '../../domain/post/postId.ts';
import type { Session } from '../../domain/session/session.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { DeletePostUseCase } from '../deletePost.ts';
import { arbSessionId, arbUser } from './helper/arbitraries.ts';
import {
  createMockActorResolverByUserId,
  createMockLikeNotificationDeletedStore,
  createMockLikeNotificationsResolverByPostId,
  createMockPostDeletedStore,
  createMockPostResolver,
  createMockRepostDeletedStore,
  createMockRepostsResolverByOriginalPostId,
  createMockRequestContext,
  createMockSessionResolver,
  createMockTimelineItemDeletedStore,
  createMockTimelineItemResolverByPostId,
  createMockUserResolver,
} from './helper/mockAdaptors.ts';

vi.mock('../../env.ts', () => ({
  Env: {
    getInstance: () => ({
      ORIGIN: 'https://example.com',
    }),
  },
}));

describe('DeletePostUseCase', () => {
  const createDeps = () => {
    const sessionResolver = createMockSessionResolver();
    const postDeletedStore = createMockPostDeletedStore();
    const userResolver = createMockUserResolver();
    const actorResolverByUserId = createMockActorResolverByUserId();
    const postResolver = createMockPostResolver();
    const timelineItemDeletedStore = createMockTimelineItemDeletedStore();
    const timelineItemResolverByPostId = createMockTimelineItemResolverByPostId();
    const likeNotificationDeletedStore = createMockLikeNotificationDeletedStore();
    const likeNotificationsResolverByPostId = createMockLikeNotificationsResolverByPostId();
    const repostDeletedStore = createMockRepostDeletedStore();
    const repostsResolverByOriginalPostId = createMockRepostsResolverByOriginalPostId();
    return {
      sessionResolver,
      postDeletedStore,
      userResolver,
      actorResolverByUserId,
      postResolver,
      timelineItemDeletedStore,
      timelineItemResolverByPostId,
      likeNotificationDeletedStore,
      likeNotificationsResolverByPostId,
      repostDeletedStore,
      repostsResolverByOriginalPostId,
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
    it('自分の投稿を削除できる', async () => {
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
      const post: LocalPost = {
        type: 'local',
        postId: crypto.randomUUID() as PostId,
        actorId: actor.id,
        content: 'Post to delete',
        createdAt: Date.now() as LocalPost['createdAt'],
        userId: user.id,
      };
      setupValidUserSession(deps, user, session, actor);
      deps.postResolver.setPost(post);

      const useCase = DeletePostUseCase.create(deps);
      const ctx = createMockRequestContext();

      const result = await useCase.run({
        sessionId: session.sessionId,
        postId: post.postId,
        ctx,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.success).toBe(true);
        expect(deps.postDeletedStore.store).toHaveBeenCalledTimes(1);
      }
    });

    fcTest.prop([arbUser()])(
      'プロパティ: 有効なセッションで自分の投稿を削除できる',
      async (user) => {
        const deps = createDeps();
        const session: Session = {
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
        const post: LocalPost = {
          type: 'local',
          postId: crypto.randomUUID() as PostId,
          actorId: actor.id,
          content: 'Test',
          createdAt: Date.now() as LocalPost['createdAt'],
          userId: user.id,
        };
        setupValidUserSession(deps, user, session, actor);
        deps.postResolver.setPost(post);

        const useCase = DeletePostUseCase.create(deps);
        const ctx = createMockRequestContext();

        const result = await useCase.run({
          sessionId: session.sessionId,
          postId: post.postId,
          ctx,
        });

        expect(result.ok).toBe(true);
      },
    );
  });

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

      const useCase = DeletePostUseCase.create(deps);
      const ctx = createMockRequestContext();

      const result = await useCase.run({
        sessionId: expiredSession.sessionId,
        postId: crypto.randomUUID() as PostId,
        ctx,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err.type).toBe('SessionExpiredError');
      }
    });

    it('セッションが存在しない場合 SessionExpiredError を返す', async () => {
      const deps = createDeps();

      const useCase = DeletePostUseCase.create(deps);
      const ctx = createMockRequestContext();

      const result = await useCase.run({
        sessionId: crypto.randomUUID() as Session['sessionId'],
        postId: crypto.randomUUID() as PostId,
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

      const useCase = DeletePostUseCase.create(deps);
      const ctx = createMockRequestContext();

      const result = await useCase.run({
        sessionId: session.sessionId,
        postId: crypto.randomUUID() as PostId,
        ctx,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err.type).toBe('UserNotFoundError');
      }
    });

    it('投稿が存在しない場合 PostNotFoundError を返す', async () => {
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

      const useCase = DeletePostUseCase.create(deps);
      const ctx = createMockRequestContext();

      const result = await useCase.run({
        sessionId: session.sessionId,
        postId: crypto.randomUUID() as PostId,
        ctx,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err.type).toBe('PostNotFoundError');
      }
    });

    it('他人の投稿を削除しようとすると UnauthorizedError を返す', async () => {
      const deps = createDeps();
      const user: User = {
        id: crypto.randomUUID() as User['id'],
        username: 'kosui' as Username,
      };
      const otherUserId = crypto.randomUUID() as User['id'];
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
      const otherPost: LocalPost = {
        type: 'local',
        postId: crypto.randomUUID() as PostId,
        actorId: crypto.randomUUID() as LocalPost['actorId'],
        content: 'Other user post',
        createdAt: Date.now() as LocalPost['createdAt'],
        userId: otherUserId,
      };
      setupValidUserSession(deps, user, session, actor);
      deps.postResolver.setPost(otherPost);

      const useCase = DeletePostUseCase.create(deps);
      const ctx = createMockRequestContext();

      const result = await useCase.run({
        sessionId: session.sessionId,
        postId: otherPost.postId,
        ctx,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err.type).toBe('UnauthorizedError');
      }
    });

    it('リモート投稿を削除しようとすると UnauthorizedError を返す', async () => {
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
      const remotePost: RemotePost = {
        type: 'remote',
        postId: crypto.randomUUID() as PostId,
        actorId: crypto.randomUUID() as RemotePost['actorId'],
        content: 'Remote post',
        createdAt: Date.now() as RemotePost['createdAt'],
        uri: 'https://remote.example.com/posts/1',
      };
      setupValidUserSession(deps, user, session, actor);
      deps.postResolver.setPost(remotePost);

      const useCase = DeletePostUseCase.create(deps);
      const ctx = createMockRequestContext();

      const result = await useCase.run({
        sessionId: session.sessionId,
        postId: remotePost.postId,
        ctx,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err.type).toBe('UnauthorizedError');
      }
    });

    fcTest.prop([arbSessionId()])(
      'プロパティ: 存在しないセッションIDでは削除できない',
      async (sessionId) => {
        const deps = createDeps();
        const useCase = DeletePostUseCase.create(deps);
        const ctx = createMockRequestContext();

        const result = await useCase.run({
          sessionId,
          postId: crypto.randomUUID() as PostId,
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
    it('削除成功時に postDeletedStore が呼ばれる', async () => {
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
      const post: LocalPost = {
        type: 'local',
        postId: crypto.randomUUID() as PostId,
        actorId: actor.id,
        content: 'Test',
        createdAt: Date.now() as LocalPost['createdAt'],
        userId: user.id,
      };
      setupValidUserSession(deps, user, session, actor);
      deps.postResolver.setPost(post);

      const useCase = DeletePostUseCase.create(deps);
      const ctx = createMockRequestContext();

      await useCase.run({
        sessionId: session.sessionId,
        postId: post.postId,
        ctx,
      });

      expect(deps.postDeletedStore.store).toHaveBeenCalledTimes(1);
    });

    it('削除失敗時は postDeletedStore が呼ばれない', async () => {
      const deps = createDeps();
      const useCase = DeletePostUseCase.create(deps);
      const ctx = createMockRequestContext();

      await useCase.run({
        sessionId: crypto.randomUUID() as Session['sessionId'],
        postId: crypto.randomUUID() as PostId,
        ctx,
      });

      expect(deps.postDeletedStore.store).not.toHaveBeenCalled();
    });
  });

  describe('ActivityPub連携', () => {
    it('削除成功時にDelete Activityが送信される', async () => {
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
      const post: LocalPost = {
        type: 'local',
        postId: crypto.randomUUID() as PostId,
        actorId: actor.id,
        content: 'Test',
        createdAt: Date.now() as LocalPost['createdAt'],
        userId: user.id,
      };
      setupValidUserSession(deps, user, session, actor);
      deps.postResolver.setPost(post);

      const useCase = DeletePostUseCase.create(deps);
      const ctx = createMockRequestContext();

      await useCase.run({
        sessionId: session.sessionId,
        postId: post.postId,
        ctx,
      });

      expect(ctx.sendActivity).toHaveBeenCalled();
    });
  });
});
