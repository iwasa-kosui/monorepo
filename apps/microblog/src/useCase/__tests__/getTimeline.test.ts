import { test as fcTest } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { PostWithAuthor } from '../../domain/post/post.ts';
import type { PostId } from '../../domain/post/postId.ts';
import type { Session } from '../../domain/session/session.ts';
import type { TimelineItemWithPost } from '../../domain/timeline/timelineItem.ts';
import type { TimelineItemId } from '../../domain/timeline/timelineItemId.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { GetTimelineUseCase } from '../getTimeline.ts';
import { arbSessionId, arbUser } from './helper/arbitraries.ts';
import {
  createMockActorResolverByUserId,
  createMockActorsResolverByFollowerId,
  createMockActorsResolverByFollowingId,
  createMockSessionResolver,
  createMockTimelineItemsResolverByActorIds,
  createMockUserResolver,
} from './helper/mockAdaptors.ts';

describe('GetTimelineUseCase', () => {
  const createDeps = () => {
    const sessionResolver = createMockSessionResolver();
    const userResolver = createMockUserResolver();
    const actorResolverByUserId = createMockActorResolverByUserId();
    const timelineItemsResolverByActorIds = createMockTimelineItemsResolverByActorIds();
    const actorsResolverByFollowerId = createMockActorsResolverByFollowerId();
    const actorsResolverByFollowingId = createMockActorsResolverByFollowingId();
    return {
      sessionResolver,
      userResolver,
      actorResolverByUserId,
      timelineItemsResolverByActorIds,
      actorsResolverByFollowerId,
      actorsResolverByFollowingId,
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
    it('タイムラインを取得できる', async () => {
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

      const useCase = GetTimelineUseCase.create(deps);

      const result = await useCase.run({
        sessionId: session.sessionId,
        createdAt: undefined,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.user.id).toBe(user.id);
        expect(result.val.actor.id).toBe(actor.id);
        expect(result.val.timelineItems).toEqual([]);
        expect(result.val.following).toEqual([]);
        expect(result.val.followers).toEqual([]);
      }
    });

    it('投稿を含むタイムラインを取得できる', async () => {
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

      const post: PostWithAuthor = {
        type: 'local',
        postId: crypto.randomUUID() as PostId,
        actorId: actor.id,
        content: 'Hello, timeline!',
        createdAt: Date.now() as PostWithAuthor['createdAt'],
        userId: user.id,
        username: user.username,
        logoUri: undefined,
        liked: false,
        reposted: false,
        images: [],
        inReplyToUri: null,
      };
      const timelineItems: TimelineItemWithPost[] = [
        {
          type: 'post',
          timelineItemId: crypto.randomUUID() as TimelineItemId,
          post,
          createdAt: post.createdAt,
        },
      ];
      deps.timelineItemsResolverByActorIds.setItems(timelineItems);

      const useCase = GetTimelineUseCase.create(deps);

      const result = await useCase.run({
        sessionId: session.sessionId,
        createdAt: undefined,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.timelineItems).toHaveLength(1);
        expect(result.val.timelineItems[0].post.content).toBe('Hello, timeline!');
      }
    });

    it('フォロー中のユーザーの投稿も取得できる', async () => {
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
      const followingActor: LocalActor = {
        id: crypto.randomUUID() as LocalActor['id'],
        userId: crypto.randomUUID() as User['id'],
        uri: 'https://example.com/users/following',
        inboxUrl: 'https://example.com/inbox',
        type: 'local',
        logoUri: undefined,
      };
      setupValidUserSession(deps, user, session, actor);
      deps.actorsResolverByFollowerId.setActors(actor.id, [followingActor]);

      const useCase = GetTimelineUseCase.create(deps);

      const result = await useCase.run({
        sessionId: session.sessionId,
        createdAt: undefined,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.val.following).toHaveLength(1);
        expect(result.val.following[0].id).toBe(followingActor.id);
      }
    });

    fcTest.prop([arbUser()])(
      'プロパティ: 有効なセッションでタイムラインを取得できる',
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
        setupValidUserSession(deps, user, session, actor);

        const useCase = GetTimelineUseCase.create(deps);

        const result = await useCase.run({
          sessionId: session.sessionId,
          createdAt: undefined,
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.val.user.id).toBe(user.id);
        }
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

      const useCase = GetTimelineUseCase.create(deps);

      const result = await useCase.run({
        sessionId: expiredSession.sessionId,
        createdAt: undefined,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err.type).toBe('SessionExpiredError');
      }
    });

    it('セッションが存在しない場合 SessionExpiredError を返す', async () => {
      const deps = createDeps();

      const useCase = GetTimelineUseCase.create(deps);

      const result = await useCase.run({
        sessionId: crypto.randomUUID() as Session['sessionId'],
        createdAt: undefined,
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

      const useCase = GetTimelineUseCase.create(deps);

      const result = await useCase.run({
        sessionId: session.sessionId,
        createdAt: undefined,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err.type).toBe('UserNotFoundError');
      }
    });

    fcTest.prop([arbSessionId()])(
      'プロパティ: 存在しないセッションIDではタイムラインを取得できない',
      async (sessionId) => {
        const deps = createDeps();
        const useCase = GetTimelineUseCase.create(deps);

        const result = await useCase.run({
          sessionId,
          createdAt: undefined,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.err.type).toBe('SessionExpiredError');
        }
      },
    );
  });

  describe('副作用の検証', () => {
    it('各 resolver が正しく呼び出される', async () => {
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

      const useCase = GetTimelineUseCase.create(deps);

      await useCase.run({
        sessionId: session.sessionId,
        createdAt: undefined,
      });

      expect(deps.sessionResolver.resolve).toHaveBeenCalledWith(session.sessionId);
      expect(deps.userResolver.resolve).toHaveBeenCalledWith(user.id);
      expect(deps.actorResolverByUserId.resolve).toHaveBeenCalledWith(user.id);
      expect(deps.actorsResolverByFollowerId.resolve).toHaveBeenCalledWith(actor.id);
      expect(deps.actorsResolverByFollowingId.resolve).toHaveBeenCalledWith(actor.id);
      expect(deps.timelineItemsResolverByActorIds.resolve).toHaveBeenCalled();
    });
  });
});
