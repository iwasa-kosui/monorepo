import { Create, type Note } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { Relay } from '../../domain/relay/relay.ts';
import type { Session } from '../../domain/session/session.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { CreatePostUseCase } from '../createPost.ts';
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
    return setupValidUserSession(deps, user, session, actor);
  };

  describe('異常系', () => {
    it('セッションが期限切れなら SessionExpiredError を返し、何も保存も配送もしない', async () => {
      const deps = createDeps();
      const expiredSession: Session = {
        sessionId: crypto.randomUUID() as Session['sessionId'],
        userId: crypto.randomUUID() as User['id'],
        expires: (Date.now() - 1000) as Session['expires'],
      };
      deps.sessionResolver.setSession(expiredSession);
      const ctx = createMockRequestContext();

      const result = await CreatePostUseCase.create(deps).run({
        sessionId: expiredSession.sessionId,
        content: 'Test',
        imageUrls: ['https://example.com/image.png'],
        ctx,
      });

      expect(result).toMatchObject({ ok: false, err: { type: 'SessionExpiredError' } });
      expect(deps.postCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.postImageCreatedStore.store).not.toHaveBeenCalled();
      expect(ctx.sendActivity).not.toHaveBeenCalled();
    });
  });

  describe('Bluesky への投稿の予約', () => {
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

    it.each(['unlisted', 'private'] as const)(
      '%s はリレーに送らず、followers と mentions に送る',
      async (visibility) => {
        const { result, relayCall, followersCall, mentionCall } = await post(visibility);

        expect(result.ok && result.val.post.visibility).toBe(visibility);
        expect(relayCall).toBeUndefined();
        expect(followersCall).toBeDefined();
        expect(mentionCall).toBeDefined();
      },
    );

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
    });
  });
});
