import { Endpoints, Person } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import { BookmarkId } from '../../domain/bookmark/bookmarkId.ts';
import type { LocalPost, PostQuote, PostQuotesResolverByPostIds, RemotePost } from '../../domain/post/post.ts';
import type { PostId } from '../../domain/post/postId.ts';
import type { Session } from '../../domain/session/session.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { DeletePostUseCase } from '../deletePost.ts';
import {
  createMockActorResolverByUserId,
  createMockArticleDeletedStore,
  createMockArticleResolverByRootPostId,
  createMockEmojiReactDeletedStore,
  createMockEmojiReactNotificationDeletedStore,
  createMockEmojiReactNotificationsResolverByPostId,
  createMockEmojiReactsResolverByPostId,
  createMockLikeNotificationDeletedStore,
  createMockLikeNotificationsResolverByPostId,
  createMockLikesResolverByPostId,
  createMockLocalLikeDeletedStore,
  createMockPostDeletedStore,
  createMockPostResolver,
  createMockRemoteLikeDeletedStore,
  createMockReplyNotificationDeletedStore,
  createMockReplyNotificationsResolverByOriginalPostId,
  createMockReplyNotificationsResolverByReplyPostId,
  createMockRepostDeletedStore,
  createMockRepostsResolverByPostId,
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
    const emojiReactNotificationDeletedStore = createMockEmojiReactNotificationDeletedStore();
    const emojiReactNotificationsResolverByPostId = createMockEmojiReactNotificationsResolverByPostId();
    const replyNotificationDeletedStore = createMockReplyNotificationDeletedStore();
    const replyNotificationsResolverByReplyPostId = createMockReplyNotificationsResolverByReplyPostId();
    const replyNotificationsResolverByOriginalPostId = createMockReplyNotificationsResolverByOriginalPostId();
    const repostDeletedStore = createMockRepostDeletedStore();
    const repostsResolverByPostId = createMockRepostsResolverByPostId();
    const localLikeDeletedStore = createMockLocalLikeDeletedStore();
    const remoteLikeDeletedStore = createMockRemoteLikeDeletedStore();
    const likesResolverByPostId = createMockLikesResolverByPostId();
    const emojiReactDeletedStore = createMockEmojiReactDeletedStore();
    const emojiReactsResolverByPostId = createMockEmojiReactsResolverByPostId();
    const articleResolverByRootPostId = createMockArticleResolverByRootPostId();
    const articleDeletedStore = createMockArticleDeletedStore();
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
      emojiReactNotificationDeletedStore,
      emojiReactNotificationsResolverByPostId,
      replyNotificationDeletedStore,
      replyNotificationsResolverByReplyPostId,
      replyNotificationsResolverByOriginalPostId,
      repostDeletedStore,
      repostsResolverByPostId,
      localLikeDeletedStore,
      remoteLikeDeletedStore,
      likesResolverByPostId,
      emojiReactDeletedStore,
      emojiReactsResolverByPostId,
      articleResolverByRootPostId,
      articleDeletedStore,
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

  const aliceId = 'https://remote.example/users/alice';
  const selfId = 'https://example.com/users/kosui';

  const setup = (content = '<p>Post to delete</p>', visibility: LocalPost['visibility'] = 'public') => {
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
      uri: selfId,
      inboxUrl: 'https://example.com/inbox',
      type: 'local',
      logoUri: undefined,
    };
    const post: LocalPost = {
      type: 'local',
      visibility: visibility,
      summary: null,
      sensitive: false,
      postId: crypto.randomUUID() as PostId,
      actorId: actor.id,
      content,
      createdAt: Date.now() as LocalPost['createdAt'],
      userId: user.id,
      inReplyToUri: null,
    };
    setupValidUserSession(deps, user, session, actor);
    deps.postResolver.setPost(post);
    const ctx = createMockRequestContext();
    const lookupObject = vi.fn(async (uri: string) =>
      uri === aliceId
        ? new Person({
          id: new URL(aliceId),
          inbox: new URL(`${aliceId}/inbox`),
          endpoints: new Endpoints({ sharedInbox: new URL('https://remote.example/inbox') }),
        })
        : null
    );
    Object.assign(ctx, { lookupObject, getDocumentLoader: vi.fn(async () => ({})) });
    const run = (extra: Partial<Parameters<typeof DeletePostUseCase.create>[0]> = {}) =>
      DeletePostUseCase.create({ ...deps, ...extra }).run({
        sessionId: session.sessionId,
        postId: post.postId,
        ctx,
      });
    return { deps, ctx, lookupObject, run, postId: post.postId, actorId: actor.id, session };
  };

  describe('正常系', () => {
    it('投稿を削除したあとに、Bluesky の投稿の削除を依頼する', async () => {
      const { deps, run, postId } = setup();
      const removeBlueskyCrosspost = { run: vi.fn(async () => RA.ok('removed' as const)) };

      const result = await run({ removeBlueskyCrosspost });

      expect(result.ok).toBe(true);
      expect(removeBlueskyCrosspost.run).toHaveBeenCalledExactlyOnceWith({ postId });
      expect(vi.mocked(deps.postDeletedStore.store).mock.invocationCallOrder[0]).toBeLessThan(
        removeBlueskyCrosspost.run.mock.invocationCallOrder[0]!,
      );
    });

    it('投稿を削除する前に、その投稿のブックマークを削除する', async () => {
      const { deps, run, postId, actorId } = setup();
      const bookmark = { bookmarkId: BookmarkId.generate(), actorId, postId };
      const bookmarksResolverByPostId = { resolve: vi.fn(async () => RA.ok([bookmark])) };
      const bookmarkDeletedStore = { store: vi.fn(async () => RA.ok(undefined)) };

      const result = await run({ bookmarksResolverByPostId, bookmarkDeletedStore });

      expect(result.ok).toBe(true);
      expect(bookmarksResolverByPostId.resolve).toHaveBeenCalledWith({ postId });
      expect(bookmarkDeletedStore.store).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'bookmark.bookmarkDeleted',
          eventPayload: { bookmarkId: bookmark.bookmarkId },
        }),
      );
      expect(bookmarkDeletedStore.store.mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(deps.postDeletedStore.store).mock.invocationCallOrder[0]!,
      );
    });
  });

  describe('異常系', () => {
    it('セッションが期限切れの場合 SessionExpiredError を返す', async () => {
      const deps = createDeps();
      const expiredSession: Session = {
        sessionId: crypto.randomUUID() as Session['sessionId'],
        userId: crypto.randomUUID() as User['id'],
        expires: (Date.now() - 1000) as Session['expires'],
      };
      deps.sessionResolver.setSession(expiredSession);

      const result = await DeletePostUseCase.create(deps).run({
        sessionId: expiredSession.sessionId,
        postId: crypto.randomUUID() as PostId,
        ctx: createMockRequestContext(),
      });

      expect(!result.ok && result.err.type).toBe('SessionExpiredError');
    });

    it('他人の投稿を削除しようとすると UnauthorizedError を返し、削除も配送もしない', async () => {
      const { deps, ctx, session } = setup();
      const otherPost: LocalPost = {
        type: 'local',
        visibility: 'public',
        summary: null,
        sensitive: false,
        postId: crypto.randomUUID() as PostId,
        actorId: crypto.randomUUID() as LocalPost['actorId'],
        content: 'Other user post',
        createdAt: Date.now() as LocalPost['createdAt'],
        userId: crypto.randomUUID() as User['id'],
        inReplyToUri: null,
      };
      deps.postResolver.setPost(otherPost);

      const result = await DeletePostUseCase.create(deps).run({
        sessionId: session.sessionId,
        postId: otherPost.postId,
        ctx,
      });

      expect(!result.ok && result.err.type).toBe('UnauthorizedError');
      expect(deps.postDeletedStore.store).not.toHaveBeenCalled();
      expect(ctx.sendActivity).not.toHaveBeenCalled();
    });

    it('リモート投稿を削除しようとすると UnauthorizedError を返す', async () => {
      const { deps, ctx, session } = setup();
      const remotePost: RemotePost = {
        type: 'remote',
        summary: null,
        sensitive: false,
        postId: crypto.randomUUID() as PostId,
        actorId: crypto.randomUUID() as RemotePost['actorId'],
        content: 'Remote post',
        createdAt: Date.now() as RemotePost['createdAt'],
        uri: 'https://remote.example.com/posts/1',
        inReplyToUri: null,
        visibility: null,
      };
      deps.postResolver.setPost(remotePost);

      const result = await DeletePostUseCase.create(deps).run({
        sessionId: session.sessionId,
        postId: remotePost.postId,
        ctx,
      });

      expect(!result.ok && result.err.type).toBe('UnauthorizedError');
      expect(deps.postDeletedStore.store).not.toHaveBeenCalled();
    });
  });

  describe('ActivityPub連携', () => {
    describe('メンション相手への配送', () => {
      const mentionOf = (id: string, name: string) =>
        `<span class="h-card"><a href="${id}" class="u-url mention">@<span>${name}</span></a></span>`;

      const quoteResolverOf = (postId: PostId, quote: PostQuote) => {
        const resolve = vi.fn(async () => RA.ok(new Map<PostId, PostQuote>([[postId, quote]])));
        return { resolve } as unknown as PostQuotesResolverByPostIds & { resolve: typeof resolve };
      };
      const bobId = 'https://remote.example/users/bob';
      const bobQuote: PostQuote = {
        uri: 'https://remote.example/notes/1',
        author: { id: bobId, inboxUrl: `${bobId}/inbox`, username: 'bob' },
      };

      it('direct の投稿を消すと、followers には送らず、参加者の inbox にだけ共有 inbox を使わず Delete を送る', async () => {
        const { deps, ctx, run } = setup('<p>secret</p>', 'direct');
        const directPostParticipantsResolverByPostId = {
          resolve: vi.fn(() => RA.ok([selfId, aliceId, 'https://example.com/users/hanako'])),
        };

        const result = await run({ directPostParticipantsResolverByPostId });

        expect(result.ok).toBe(true);
        const calls = vi.mocked(ctx.sendActivity).mock.calls;
        expect(calls).toHaveLength(1);
        expect(calls[0]?.[1]).toEqual([
          {
            id: new URL(aliceId),
            inboxId: new URL(`${aliceId}/inbox`),
            endpoints: { sharedInbox: new URL('https://remote.example/inbox') },
          },
        ]);
        expect(calls[0]?.[3]).toEqual({ preferSharedInbox: false });
        expect(vi.mocked(directPostParticipantsResolverByPostId.resolve).mock.invocationCallOrder[0])
          .toBeLessThan(vi.mocked(deps.postDeletedStore.store).mock.invocationCallOrder[0]!);
      });

      it('メンションのある投稿を消すと、相手にも同じ Delete を送る', async () => {
        const { ctx, run } = setup(`<p>hi ${mentionOf(aliceId, 'alice@remote.example')}</p>`);

        const result = await run();

        expect(result.ok).toBe(true);
        const calls = vi.mocked(ctx.sendActivity).mock.calls;
        expect(calls).toHaveLength(2);
        expect(calls[0]?.[1]).toBe('followers');
        expect(calls[1]?.[1]).toEqual([
          {
            id: new URL(aliceId),
            inboxId: new URL(`${aliceId}/inbox`),
            endpoints: { sharedInbox: new URL('https://remote.example/inbox') },
          },
        ]);
        expect(calls[1]?.[2]).toBe(calls[0]?.[2]);
      });

      it('相手の actor を解決できなくても削除は成功し、相手には送らない', async () => {
        const { deps, ctx, lookupObject, run } = setup(
          `<p>${mentionOf('https://gone.example/users/bob', 'bob@gone.example')}</p>`,
        );
        lookupObject.mockRejectedValue(new Error('network down'));

        const result = await run();

        expect(result.ok).toBe(true);
        expect(deps.postDeletedStore.store).toHaveBeenCalledTimes(1);
        expect(ctx.sendActivity).toHaveBeenCalledTimes(1);
      });

      it('相手の lookup が返らなくても削除は成功し、時間切れの相手には送らない', async () => {
        const { deps, ctx, lookupObject, run } = setup(`<p>${mentionOf(aliceId, 'alice@remote.example')}</p>`);
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        try {
          const lookupStarted = Promise.withResolvers<void>();
          lookupObject.mockImplementation(
            (() => {
              lookupStarted.resolve();
              return new Promise(() => {});
            }) as never,
          );

          const resultPromise = run();
          await lookupStarted.promise;
          await vi.advanceTimersByTimeAsync(5000);
          const result = await resultPromise;

          expect(result.ok).toBe(true);
          expect(deps.postDeletedStore.store).toHaveBeenCalledTimes(1);
          expect(ctx.sendActivity).toHaveBeenCalledTimes(1);
        } finally {
          vi.useRealTimers();
        }
      });

      it('相手への送信が失敗しても削除は成功する', async () => {
        const { deps, ctx, run } = setup(`<p>${mentionOf(aliceId, 'alice@remote.example')}</p>`);
        vi.mocked(ctx.sendActivity).mockImplementation(async (_sender, recipients) => {
          if (recipients !== 'followers') throw new Error('delivery failed');
        });

        const result = await run();

        expect(result.ok).toBe(true);
        expect(deps.postDeletedStore.store).toHaveBeenCalledTimes(1);
      });

      it('自分のホストのメンションは引かず、送らない', async () => {
        const { ctx, lookupObject, run } = setup(`<p>${mentionOf(selfId, 'kosui@example.com')}</p>`);

        await run();

        expect(lookupObject).not.toHaveBeenCalled();
        expect(ctx.sendActivity).toHaveBeenCalledTimes(1);
      });

      it('引用の投稿を消すと、引用先の作者にも同じ Delete を送る', async () => {
        const { ctx, run, postId } = setup('<p>look</p>');

        const result = await run({ postQuotesResolver: quoteResolverOf(postId, bobQuote) });

        expect(result.ok).toBe(true);
        const calls = vi.mocked(ctx.sendActivity).mock.calls;
        expect(calls).toHaveLength(2);
        expect(calls[1]?.[1]).toEqual([
          { id: new URL(bobId), inboxId: new URL(`${bobId}/inbox`), endpoints: null },
        ]);
        expect(calls[1]?.[2]).toBe(calls[0]?.[2]);
      });

      it('引用先の作者を、投稿を削除する前に引く', async () => {
        const { deps, run, postId } = setup('<p>look</p>');
        const resolver = quoteResolverOf(postId, bobQuote);

        await run({ postQuotesResolver: resolver });

        expect(resolver.resolve).toHaveBeenCalledWith([postId]);
        expect(resolver.resolve.mock.invocationCallOrder[0]).toBeLessThan(
          vi.mocked(deps.postDeletedStore.store).mock.invocationCallOrder[0]!,
        );
      });

      it('引用先の作者が本文のメンションの相手と同じなら、1回だけ送る', async () => {
        const { ctx, run, postId } = setup(`<p>${mentionOf(aliceId, 'alice@remote.example')}</p>`);
        const quote: PostQuote = {
          uri: 'https://remote.example/notes/2',
          author: { id: aliceId, inboxUrl: `${aliceId}/inbox`, username: 'alice' },
        };

        await run({ postQuotesResolver: quoteResolverOf(postId, quote) });

        const calls = vi.mocked(ctx.sendActivity).mock.calls;
        expect(calls).toHaveLength(2);
        expect(calls[1]?.[1]).toHaveLength(1);
      });

      it('引用先の作者が分からない(ローカルの引用先や未取得)ときは、作者には送らない', async () => {
        const { ctx, run, postId } = setup('<p>look</p>');

        const result = await run({ postQuotesResolver: quoteResolverOf(postId, { uri: bobQuote.uri, author: null }) });

        expect(result.ok).toBe(true);
        expect(ctx.sendActivity).toHaveBeenCalledTimes(1);
      });

      it('direct の投稿を消すときは、引用先の作者が参加者でなければ送らない', async () => {
        const { ctx, run, postId } = setup('<p>secret</p>', 'direct');
        const postQuotesResolver = quoteResolverOf(postId, bobQuote);
        const directPostParticipantsResolverByPostId = {
          resolve: vi.fn(() => RA.ok([selfId, aliceId])),
        };

        await run({ postQuotesResolver, directPostParticipantsResolverByPostId });

        expect(postQuotesResolver.resolve).not.toHaveBeenCalled();
        const calls = vi.mocked(ctx.sendActivity).mock.calls;
        expect(calls).toHaveLength(1);
        expect(calls[0]?.[1]).toEqual([
          {
            id: new URL(aliceId),
            inboxId: new URL(`${aliceId}/inbox`),
            endpoints: { sharedInbox: new URL('https://remote.example/inbox') },
          },
        ]);
      });
    });
  });
});
