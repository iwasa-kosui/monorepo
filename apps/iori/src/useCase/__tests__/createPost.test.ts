import { test as fcTest } from '@fast-check/vitest';
import { Create, type Note } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { Relay } from '../../domain/relay/relay.ts';
import type { Session } from '../../domain/session/session.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { CreatePostUseCase } from '../createPost.ts';
import { arbContent, arbImageUrls, arbSessionId, arbUser } from './helper/arbitraries.ts';
import {
  createMockAcceptedRelaysResolver,
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
    const acceptedRelaysResolver = createMockAcceptedRelaysResolver();
    return {
      sessionResolver,
      postCreatedStore,
      userResolver,
      actorResolverByUserId,
      postImageCreatedStore,
      timelineItemCreatedStore,
      linkPreviewCreatedStore,
      ogpFetcher,
      acceptedRelaysResolver,
      origin: 'https://example.com',
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
      { summary: 'cw', sensitive: true, expectedSummary: 'cw', expectedSensitive: true },
      { summary: null, sensitive: false, expectedSummary: null, expectedSensitive: false },
      { summary: undefined, sensitive: undefined, expectedSummary: null, expectedSensitive: false },
    ])(
      'summary $summary、sensitive $sensitive を保存した投稿に載せる',
      async ({ summary, sensitive, expectedSummary, expectedSensitive }) => {
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

        const result = await CreatePostUseCase.create(deps).run({
          sessionId: session.sessionId,
          content: 'Hello, world!',
          imageUrls: [],
          summary,
          sensitive,
          ctx: createMockRequestContext(),
        });

        expect(result.ok).toBe(true);
        expect(deps.postCreatedStore.items).toHaveLength(1);
        expect(deps.postCreatedStore.items[0]?.aggregateState).toMatchObject({
          summary: expectedSummary,
          sensitive: expectedSensitive,
        });
      },
    );

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

  describe('Bluesky への投稿の予約', () => {
    const setupUser = (deps: ReturnType<typeof createDeps>) => {
      const user: User = { id: crypto.randomUUID() as User['id'], username: 'kosui' as Username };
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
      return session;
    };

    it('投稿の保存と配送のあとに、作った投稿の ID で予約する', async () => {
      const deps = createDeps();
      const session = setupUser(deps);
      const scheduleBlueskyCrosspost = { run: vi.fn(async () => RA.ok('pending' as const)) };
      const ctx = createMockRequestContext();

      const result = await CreatePostUseCase.create({ ...deps, scheduleBlueskyCrosspost }).run({
        sessionId: session.sessionId,
        content: 'Hello Bluesky!',
        imageUrls: [],
        ctx,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(scheduleBlueskyCrosspost.run).toHaveBeenCalledExactlyOnceWith({ postId: result.val.post.postId });
      expect(vi.mocked(ctx.sendActivity).mock.invocationCallOrder[0]).toBeLessThan(
        scheduleBlueskyCrosspost.run.mock.invocationCallOrder[0]!,
      );
    });

    it('Bluesky に送らない指定のときは予約せず、Fediverse には配送する', async () => {
      const deps = createDeps();
      const session = setupUser(deps);
      const scheduleBlueskyCrosspost = { run: vi.fn(async () => RA.ok('pending' as const)) };
      const ctx = createMockRequestContext();

      const result = await CreatePostUseCase.create({ ...deps, scheduleBlueskyCrosspost }).run({
        sessionId: session.sessionId,
        content: 'Fediverse only',
        imageUrls: [],
        crosspostToBluesky: false,
        ctx,
      });

      expect(result.ok).toBe(true);
      expect(scheduleBlueskyCrosspost.run).not.toHaveBeenCalled();
      expect(ctx.sendActivity).toHaveBeenCalled();
    });

    it('Bluesky に送る指定のときは予約する', async () => {
      const deps = createDeps();
      const session = setupUser(deps);
      const scheduleBlueskyCrosspost = { run: vi.fn(async () => RA.ok('pending' as const)) };

      const result = await CreatePostUseCase.create({ ...deps, scheduleBlueskyCrosspost }).run({
        sessionId: session.sessionId,
        content: 'Both',
        imageUrls: [],
        crosspostToBluesky: true,
        ctx: createMockRequestContext(),
      });

      expect(result.ok).toBe(true);
      expect(scheduleBlueskyCrosspost.run).toHaveBeenCalledTimes(1);
    });

    it('予約の use case が無くても投稿できる', async () => {
      const deps = createDeps();
      const session = setupUser(deps);

      const result = await CreatePostUseCase.create(deps).run({
        sessionId: session.sessionId,
        content: 'Hello',
        imageUrls: [],
        ctx: createMockRequestContext(),
      });

      expect(result.ok).toBe(true);
    });
  });

  describe('メンション相手への配送', () => {
    const alice = {
      id: 'https://remote.example/users/alice',
      inboxUrl: 'https://remote.example/users/alice/inbox',
      sharedInboxUrl: 'https://remote.example/inbox',
    };

    const setup = () => {
      const deps = createDeps();
      const user: User = { id: crypto.randomUUID() as User['id'], username: 'kosui' as Username };
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
      return { deps, session };
    };

    it('followers への送信に加えて、mentions の相手に同じ Create を送る', async () => {
      const { deps, session } = setup();
      const ctx = createMockRequestContext();

      const result = await CreatePostUseCase.create(deps).run({
        sessionId: session.sessionId,
        content: 'hi',
        imageUrls: [],
        mentions: [alice],
        ctx,
      });

      expect(result.ok).toBe(true);
      const calls = vi.mocked(ctx.sendActivity).mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[0]?.[1]).toBe('followers');
      expect(calls[1]?.[0]).toEqual({ identifier: 'kosui' });
      expect(calls[1]?.[1]).toEqual([
        {
          id: new URL(alice.id),
          inboxId: new URL(alice.inboxUrl),
          endpoints: { sharedInbox: new URL(alice.sharedInboxUrl) },
        },
      ]);
      expect(calls[1]?.[2]).toBe(calls[0]?.[2]);
      expect(calls[1]?.[3]).toEqual({ preferSharedInbox: true });
    });

    it('mentions の無い投稿は followers にだけ送る', async () => {
      const { deps, session } = setup();
      const ctx = createMockRequestContext();

      await CreatePostUseCase.create(deps).run({
        sessionId: session.sessionId,
        content: 'hi',
        imageUrls: [],
        ctx,
      });

      expect(ctx.sendActivity).toHaveBeenCalledTimes(1);
    });

    it('同じ actor が重なる mentions には 1 回だけ送る', async () => {
      const { deps, session } = setup();
      const ctx = createMockRequestContext();

      await CreatePostUseCase.create(deps).run({
        sessionId: session.sessionId,
        content: 'hi',
        imageUrls: [],
        mentions: [alice, alice],
        ctx,
      });

      expect(vi.mocked(ctx.sendActivity).mock.calls[1]?.[1]).toHaveLength(1);
    });

    it('自分のホストの actor には mentions でも送らない', async () => {
      const { deps, session } = setup();
      const ctx = createMockRequestContext();
      const self = {
        id: 'https://example.com/users/kosui',
        inboxUrl: 'https://example.com/users/kosui/inbox',
      };

      await CreatePostUseCase.create(deps).run({
        sessionId: session.sessionId,
        content: 'hi',
        imageUrls: [],
        mentions: [self],
        ctx,
      });

      expect(ctx.sendActivity).toHaveBeenCalledTimes(1);
    });

    it('mentions への送信が失敗しても投稿は成功し、Bluesky の予約まで進む', async () => {
      const { deps, session } = setup();
      const ctx = createMockRequestContext();
      vi.mocked(ctx.sendActivity).mockImplementation(async (_sender, recipients) => {
        if (recipients !== 'followers') throw new Error('delivery failed');
      });
      const scheduleBlueskyCrosspost = { run: vi.fn(async () => RA.ok('pending' as const)) };

      const result = await CreatePostUseCase.create({ ...deps, scheduleBlueskyCrosspost }).run({
        sessionId: session.sessionId,
        content: 'hi',
        imageUrls: [],
        mentions: [alice],
        ctx,
      });

      expect(result.ok).toBe(true);
      expect(scheduleBlueskyCrosspost.run).toHaveBeenCalledTimes(1);
    });
  });

  describe('公開範囲ごとの配送', () => {
    const publicUri = 'https://www.w3.org/ns/activitystreams#Public';
    const followersUri = 'https://example.com/users/kosui/followers';
    const relay: Relay = {
      relayId: crypto.randomUUID() as Relay['relayId'],
      inboxUrl: 'https://relay.example/inbox',
      actorUri: 'https://relay.example/actor',
      status: 'accepted',
      createdAt: 1,
      acceptedAt: 2,
    };
    const alice = {
      id: 'https://remote.example/users/alice',
      inboxUrl: 'https://remote.example/users/alice/inbox',
      sharedInboxUrl: 'https://remote.example/inbox',
    };

    const setup = () => {
      const deps = createDeps();
      deps.acceptedRelaysResolver.setRelays([relay]);
      const user: User = { id: crypto.randomUUID() as User['id'], username: 'kosui' as Username };
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
      return { deps, session };
    };

    const post = async (visibility?: 'public' | 'unlisted' | 'private' | 'direct') => {
      const { deps, session } = setup();
      const ctx = createMockRequestContext();
      const result = await CreatePostUseCase.create(deps).run({
        sessionId: session.sessionId,
        content: `<p><a href="${alice.id}" class="u-url mention">@<span>alice@remote.example</span></a> hi</p>`,
        imageUrls: [],
        mentions: [alice],
        ...(visibility === undefined ? {} : { visibility }),
        ctx,
      });
      const calls = vi.mocked(ctx.sendActivity).mock.calls;
      const followersCall = calls.find((call) => call[1] === 'followers');
      const relayCall = calls.find((call) => (call[1] as { id?: URL }).id?.href === relay.actorUri);
      const mentionCall = calls.find((call) => Array.isArray(call[1]));
      return { deps, result, followersCall, relayCall, mentionCall, calls };
    };

    const hrefs = (urls: ReadonlyArray<URL>) => urls.map((url) => url.href);

    it('visibility を省略すると public で保存し、to に Public、cc に followers と mentions を入れる', async () => {
      const { deps, result, followersCall } = await post();

      expect(result.ok && result.val.post.visibility).toBe('public');
      expect(vi.mocked(deps.postCreatedStore.store).mock.calls[0]?.[0]?.aggregateState).toMatchObject({
        visibility: 'public',
      });
      const create = followersCall?.[2] as Create;
      expect(hrefs(create.toIds)).toEqual([publicUri]);
      expect(hrefs(create.ccIds)).toEqual([followersUri, alice.id]);
    });

    it('public はリレーにも followers と mentions にも送る', async () => {
      const { relayCall, followersCall, mentionCall } = await post('public');

      expect(relayCall).toBeDefined();
      expect(followersCall).toBeDefined();
      expect(mentionCall).toBeDefined();
    });

    it('unlisted はリレーに送らず、followers と mentions に送り、to に followers、cc に Public と mentions を入れる', async () => {
      const { result, relayCall, followersCall, mentionCall } = await post('unlisted');

      expect(result.ok && result.val.post.visibility).toBe('unlisted');
      expect(relayCall).toBeUndefined();
      expect(followersCall).toBeDefined();
      expect(mentionCall).toBeDefined();
      const create = followersCall?.[2] as Create;
      expect(hrefs(create.toIds)).toEqual([followersUri]);
      expect(hrefs(create.ccIds)).toEqual([publicUri, alice.id]);
    });

    it('private はリレーに送らず、followers と mentions に送り、Public をどこにも入れない', async () => {
      const { result, deps, relayCall, followersCall, mentionCall } = await post('private');

      expect(result.ok && result.val.post.visibility).toBe('private');
      expect(vi.mocked(deps.postCreatedStore.store).mock.calls[0]?.[0]?.aggregateState).toMatchObject({
        visibility: 'private',
      });
      expect(relayCall).toBeUndefined();
      expect(followersCall).toBeDefined();
      expect(mentionCall).toBeDefined();
      const create = followersCall?.[2] as Create;
      expect(hrefs(create.toIds)).toEqual([followersUri]);
      expect(hrefs(create.ccIds)).toEqual([alice.id]);
      expect([...hrefs(create.toIds), ...hrefs(create.ccIds)]).not.toContain(publicUri);
    });

    it('direct は followers にもリレーにも送らず、mentions の相手の inbox にだけ共有 inbox を使わず送る', async () => {
      const { result, relayCall, followersCall, calls } = await post('direct');

      expect(result.ok && result.val.post.visibility).toBe('direct');
      expect(relayCall).toBeUndefined();
      expect(followersCall).toBeUndefined();
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[1]).toEqual([
        {
          id: new URL(alice.id),
          inboxId: new URL(alice.inboxUrl),
          endpoints: { sharedInbox: new URL(alice.sharedInboxUrl) },
        },
      ]);
      expect(calls[0]?.[3]).toEqual({ preferSharedInbox: false });
      const create = calls[0]?.[2] as Create;
      expect(hrefs(create.toIds)).toEqual([alice.id]);
      expect(create.ccIds).toEqual([]);
    });

    it('direct の投稿は、作者と mentions の相手を参加者として保存し、direct 以外では保存しない', async () => {
      const direct = await post('direct');
      const publicPost = await post('public');

      expect(vi.mocked(direct.deps.postCreatedStore.store).mock.calls[0]?.[0]?.eventPayload).toMatchObject({
        participantActorUris: ['https://example.com/users/kosui', alice.id],
      });
      expect(vi.mocked(publicPost.deps.postCreatedStore.store).mock.calls[0]?.[0]?.eventPayload).toMatchObject({
        participantActorUris: [],
      });
    });

    it('private の投稿は、保存した Note の内容で Create を作る（ctx.getObject に頼らない）', async () => {
      const { deps, session } = setup();
      const ctx = createMockRequestContext();
      vi.mocked(ctx.getObject).mockResolvedValue(null);

      await CreatePostUseCase.create(deps).run({
        sessionId: session.sessionId,
        content: 'secret',
        imageUrls: [],
        visibility: 'private',
        ctx,
      });

      const create = vi.mocked(ctx.sendActivity).mock.calls[0]?.[2] as Create;
      const note = (await create.getObject()) as Note;
      expect(note.content?.toString()).toBe('secret');
      expect(hrefs(note.toIds)).toEqual([followersUri]);
      expect(note.ccIds).toEqual([]);
    });
  });
});
