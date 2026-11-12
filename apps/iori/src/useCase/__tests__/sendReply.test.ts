import { Note, Person } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { LocalPost, RemotePost } from '../../domain/post/post.ts';
import type { PostId } from '../../domain/post/postId.ts';
import type { Session } from '../../domain/session/session.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { SendReplyUseCase } from '../sendReply.ts';
import {
  createMockActorResolverByUserId,
  createMockLocalPostResolverByUri,
  createMockPostCreatedStore,
  createMockPostImageCreatedStore,
  createMockPostResolver,
  createMockPushSubscriptionsResolverByUserId,
  createMockReplyNotificationCreatedStore,
  createMockRequestContext,
  createMockSessionResolver,
  createMockTimelineItemCreatedStore,
  createMockUserResolver,
  createMockWebPushSender,
} from './helper/mockAdaptors.ts';

const createContext = () =>
  Object.assign(createMockRequestContext(), {
    getFollowersUri: vi.fn((username: string) => new URL(`https://example.com/users/${username}/followers`)),
  });

describe('SendReplyUseCase の Bluesky への投稿の予約', () => {
  const setup = () => {
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
    const parent: LocalPost = {
      type: 'local',
      visibility: 'public',
      summary: null,
      sensitive: false,
      postId: crypto.randomUUID() as PostId,
      actorId: actor.id,
      content: 'parent',
      createdAt: Date.now() as LocalPost['createdAt'],
      userId: user.id,
      inReplyToUri: null,
    };
    const sessionResolver = createMockSessionResolver();
    sessionResolver.setSession(session);
    const userResolver = createMockUserResolver();
    userResolver.setUser(user);
    const actorResolverByUserId = createMockActorResolverByUserId();
    actorResolverByUserId.setActor(actor);
    const postResolver = createMockPostResolver();
    postResolver.setPost(parent);
    const deps = {
      sessionResolver,
      userResolver,
      actorResolverByUserId,
      postCreatedStore: createMockPostCreatedStore(),
      postImageCreatedStore: createMockPostImageCreatedStore(),
      timelineItemCreatedStore: createMockTimelineItemCreatedStore(),
      localPostResolverByUri: createMockLocalPostResolverByUri(),
      replyNotificationCreatedStore: createMockReplyNotificationCreatedStore(),
      pushSubscriptionsResolver: createMockPushSubscriptionsResolverByUserId(),
      webPushSender: createMockWebPushSender(),
      postResolver,
      origin: 'https://example.com',
    };
    return { deps, session, parent };
  };

  it('返信の保存と配送のあとに、作った返信の ID で予約する', async () => {
    const { deps, session, parent } = setup();
    const scheduleBlueskyCrosspost = { run: vi.fn(async () => RA.ok('pending' as const)) };
    const ctx = createContext();

    const result = await SendReplyUseCase.create({ ...deps, scheduleBlueskyCrosspost }).run({
      sessionId: session.sessionId,
      postId: parent.postId,
      content: 'reply',
      imageUrls: [],
      request: new Request('https://example.com'),
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
    const { deps, session, parent } = setup();
    const scheduleBlueskyCrosspost = { run: vi.fn(async () => RA.ok('pending' as const)) };
    const ctx = createContext();

    const result = await SendReplyUseCase.create({ ...deps, scheduleBlueskyCrosspost }).run({
      sessionId: session.sessionId,
      postId: parent.postId,
      content: 'reply',
      imageUrls: [],
      crosspostToBluesky: false,
      request: new Request('https://example.com'),
      ctx,
    });

    expect(result.ok).toBe(true);
    expect(scheduleBlueskyCrosspost.run).not.toHaveBeenCalled();
    expect(ctx.sendActivity).toHaveBeenCalled();
  });

  it('予約の use case が無くても返信できる', async () => {
    const { deps, session, parent } = setup();

    const result = await SendReplyUseCase.create(deps).run({
      sessionId: session.sessionId,
      postId: parent.postId,
      content: 'reply',
      imageUrls: [],
      request: new Request('https://example.com'),
      ctx: createContext(),
    });

    expect(result.ok).toBe(true);
  });
});

describe('SendReplyUseCase のメンション', () => {
  const alice = {
    id: 'https://remote.example/users/alice',
    inboxUrl: 'https://remote.example/users/alice/inbox',
  };
  const bob = {
    id: 'https://other.example/users/bob',
    inboxUrl: 'https://other.example/users/bob/inbox',
  };
  const mentionHtml = (href: string, acct: string) =>
    `<span class="h-card"><a href="${href}" class="u-url mention">@<span>${acct}</span></a></span>`;

  const setup = () => {
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
    const localParent: LocalPost = {
      type: 'local',
      visibility: 'public',
      summary: null,
      sensitive: false,
      postId: crypto.randomUUID() as PostId,
      actorId: actor.id,
      content: 'parent',
      createdAt: Date.now() as LocalPost['createdAt'],
      userId: user.id,
      inReplyToUri: null,
    };
    const remoteParent: RemotePost = {
      type: 'remote',
      summary: null,
      sensitive: false,
      postId: crypto.randomUUID() as PostId,
      actorId: crypto.randomUUID() as RemotePost['actorId'],
      content: 'parent',
      createdAt: Date.now() as RemotePost['createdAt'],
      uri: 'https://remote.example/notes/1',
      inReplyToUri: null,
      visibility: 'public',
    };
    const sessionResolver = createMockSessionResolver();
    sessionResolver.setSession(session);
    const userResolver = createMockUserResolver();
    userResolver.setUser(user);
    const actorResolverByUserId = createMockActorResolverByUserId();
    actorResolverByUserId.setActor(actor);
    const postResolver = createMockPostResolver();
    postResolver.setPost(localParent);
    postResolver.setPost(remoteParent);
    const deps = {
      sessionResolver,
      userResolver,
      actorResolverByUserId,
      postCreatedStore: createMockPostCreatedStore(),
      postImageCreatedStore: createMockPostImageCreatedStore(),
      timelineItemCreatedStore: createMockTimelineItemCreatedStore(),
      localPostResolverByUri: createMockLocalPostResolverByUri(),
      replyNotificationCreatedStore: createMockReplyNotificationCreatedStore(),
      pushSubscriptionsResolver: createMockPushSubscriptionsResolverByUserId(),
      webPushSender: createMockWebPushSender(),
      postResolver,
      origin: 'https://example.com',
    };
    const ctxWithRemoteAuthor = () => {
      const author = new Person({
        id: new URL(alice.id),
        preferredUsername: 'alice',
        inbox: new URL(alice.inboxUrl),
      });
      const note = new Note({ id: new URL(remoteParent.uri), attribution: author });
      return Object.assign(createContext(), {
        getDocumentLoader: vi.fn(async () => ({})),
        lookupObject: vi.fn(async () => note),
      });
    };
    return { deps, session, localParent, remoteParent, ctxWithRemoteAuthor };
  };

  const noteOf = async (call: readonly unknown[]) => {
    const create = call[2] as { getObject: () => Promise<Note | null> };
    return (await create.getObject()) as Note;
  };

  it('親がローカルの返信は、followers に加えて mentions の相手に送る', async () => {
    const { deps, session, localParent } = setup();
    const ctx = createContext();

    const result = await SendReplyUseCase.create(deps).run({
      sessionId: session.sessionId,
      postId: localParent.postId,
      content: `<p>${mentionHtml(alice.id, 'alice@remote.example')} hi</p>`,
      imageUrls: [],
      mentions: [alice],
      request: new Request('https://example.com'),
      ctx,
    });

    expect(result.ok).toBe(true);
    const calls = vi.mocked(ctx.sendActivity).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]?.[1]).toBe('followers');
    expect(calls[1]?.[1]).toEqual([{ id: new URL(alice.id), inboxId: new URL(alice.inboxUrl), endpoints: null }]);
    const note = await noteOf(calls[0] ?? []);
    expect(note.ccIds.map((url) => url.href)).toEqual(['https://example.com/users/kosui/followers', alice.id]);
    const tags = await Array.fromAsync(note.getTags());
    expect(tags).toHaveLength(1);
  });

  it('親がリモートの返信は、作者を cc と Mention タグに入れ、本文に作者の acct が無くても付ける', async () => {
    const { deps, session, remoteParent, ctxWithRemoteAuthor } = setup();
    const ctx = ctxWithRemoteAuthor();

    const result = await SendReplyUseCase.create(deps).run({
      sessionId: session.sessionId,
      postId: remoteParent.postId,
      content: '<p>reply</p>',
      imageUrls: [],
      request: new Request('https://example.com'),
      ctx,
    });

    expect(result.ok).toBe(true);
    const calls = vi.mocked(ctx.sendActivity).mock.calls;
    expect(calls).toHaveLength(2);
    const note = await noteOf(calls[0] ?? []);
    expect(note.toIds.map((url) => url.href)).toEqual(['https://www.w3.org/ns/activitystreams#Public']);
    expect(note.ccIds.map((url) => url.href)).toEqual(['https://example.com/users/kosui/followers', alice.id]);
    const tags = await Array.fromAsync(note.getTags());
    expect(tags).toHaveLength(1);
    expect((tags[0] as { name?: { toString(): string } | null }).name?.toString()).toBe('@alice@remote.example');
  });

  it('親がリモートの返信で mentions に作者が含まれても、作者には二重に送らない', async () => {
    const { deps, session, remoteParent, ctxWithRemoteAuthor } = setup();
    const ctx = ctxWithRemoteAuthor();

    await SendReplyUseCase.create(deps).run({
      sessionId: session.sessionId,
      postId: remoteParent.postId,
      content: `<p>${mentionHtml(alice.id, 'alice@remote.example')} ${mentionHtml(bob.id, 'bob@other.example')}</p>`,
      imageUrls: [],
      mentions: [alice, bob],
      request: new Request('https://example.com'),
      ctx,
    });

    const calls = vi.mocked(ctx.sendActivity).mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[2]?.[1]).toEqual([{ id: new URL(bob.id), inboxId: new URL(bob.inboxUrl), endpoints: null }]);
    const note = await noteOf(calls[0] ?? []);
    expect(await Array.fromAsync(note.getTags())).toHaveLength(2);
  });

  it('mentions だけが作者と同じなら、作者と followers への 2 回だけ送る', async () => {
    const { deps, session, remoteParent, ctxWithRemoteAuthor } = setup();
    const ctx = ctxWithRemoteAuthor();

    await SendReplyUseCase.create(deps).run({
      sessionId: session.sessionId,
      postId: remoteParent.postId,
      content: `<p>${mentionHtml(alice.id, 'alice@remote.example')}</p>`,
      imageUrls: [],
      mentions: [alice],
      request: new Request('https://example.com'),
      ctx,
    });

    expect(ctx.sendActivity).toHaveBeenCalledTimes(2);
  });

  it('mentions への送信が失敗しても返信は成功し、Bluesky の予約まで進む', async () => {
    const { deps, session, localParent } = setup();
    const ctx = createContext();
    vi.mocked(ctx.sendActivity).mockImplementation(async (_sender, recipients) => {
      if (recipients !== 'followers') throw new Error('delivery failed');
    });
    const scheduleBlueskyCrosspost = { run: vi.fn(async () => RA.ok('pending' as const)) };

    const result = await SendReplyUseCase.create({ ...deps, scheduleBlueskyCrosspost }).run({
      sessionId: session.sessionId,
      postId: localParent.postId,
      content: `<p>${mentionHtml(alice.id, 'alice@remote.example')}</p>`,
      imageUrls: [],
      mentions: [alice],
      request: new Request('https://example.com'),
      ctx,
    });

    expect(result.ok).toBe(true);
    expect(scheduleBlueskyCrosspost.run).toHaveBeenCalledTimes(1);
  });

  it('mentions の無い返信は従来どおり followers にだけ送る', async () => {
    const { deps, session, localParent } = setup();
    const ctx = createContext();

    await SendReplyUseCase.create(deps).run({
      sessionId: session.sessionId,
      postId: localParent.postId,
      content: '<p>reply</p>',
      imageUrls: [],
      request: new Request('https://example.com'),
      ctx,
    });

    expect(ctx.sendActivity).toHaveBeenCalledTimes(1);
  });

  const followersUri = 'https://example.com/users/kosui/followers';
  const publicUri = 'https://www.w3.org/ns/activitystreams#Public';

  it.each([
    { visibility: 'unlisted' as const, tos: [followersUri], ccs: [publicUri, alice.id] },
    { visibility: 'private' as const, tos: [followersUri], ccs: [alice.id] },
  ])(
    '親がローカルの返信を $visibility にすると、Note の to と cc を公開範囲に合わせ、保存もその値で行う',
    async ({ visibility, tos, ccs }) => {
      const { deps, session, localParent } = setup();
      const ctx = createContext();

      const result = await SendReplyUseCase.create(deps).run({
        sessionId: session.sessionId,
        postId: localParent.postId,
        content: `<p>${mentionHtml(alice.id, 'alice@remote.example')} hi</p>`,
        imageUrls: [],
        mentions: [alice],
        visibility,
        request: new Request('https://example.com'),
        ctx,
      });

      expect(result.ok && result.val.post.visibility).toBe(visibility);
      const calls = vi.mocked(ctx.sendActivity).mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[0]?.[1]).toBe('followers');
      const note = await noteOf(calls[0] ?? []);
      expect(note.toIds.map((url) => url.href)).toEqual(tos);
      expect(note.ccIds.map((url) => url.href)).toEqual(ccs);
    },
  );

  it('visibility を省略した返信は public にする', async () => {
    const { deps, session, localParent } = setup();

    const result = await SendReplyUseCase.create(deps).run({
      sessionId: session.sessionId,
      postId: localParent.postId,
      content: '<p>reply</p>',
      imageUrls: [],
      request: new Request('https://example.com'),
      ctx: createContext(),
    });

    expect(result.ok && result.val.post.visibility).toBe('public');
  });

  it('親がリモートの返信を private にすると、作者と followers に送り、Public をどこにも入れない', async () => {
    const { deps, session, remoteParent, ctxWithRemoteAuthor } = setup();
    const ctx = ctxWithRemoteAuthor();

    const result = await SendReplyUseCase.create(deps).run({
      sessionId: session.sessionId,
      postId: remoteParent.postId,
      content: '<p>reply</p>',
      imageUrls: [],
      visibility: 'private',
      request: new Request('https://example.com'),
      ctx,
    });

    expect(result.ok).toBe(true);
    const calls = vi.mocked(ctx.sendActivity).mock.calls;
    expect(calls).toHaveLength(2);
    const note = await noteOf(calls[0] ?? []);
    expect(note.toIds.map((url) => url.href)).toEqual([followersUri]);
    expect(note.ccIds.map((url) => url.href)).toEqual([alice.id]);
  });
  it('親がリモートの direct の返信は followers に送らず、作者にだけ送り、作者と宛先を参加者に保存する', async () => {
    const { deps, session, remoteParent, ctxWithRemoteAuthor } = setup();
    const ctx = ctxWithRemoteAuthor();
    const actorResolverById = {
      resolve: vi.fn(() => RA.ok({ id: remoteParent.actorId, uri: alice.id } as never)),
    };

    const result = await SendReplyUseCase.create({ ...deps, actorResolverById }).run({
      sessionId: session.sessionId,
      postId: remoteParent.postId,
      content: `<p>${mentionHtml(bob.id, 'bob@other.example')} reply</p>`,
      imageUrls: [],
      visibility: 'direct',
      mentions: [bob],
      request: new Request('https://example.com'),
      ctx,
    });

    expect(result.ok && result.val.post.visibility).toBe('direct');
    const calls = vi.mocked(ctx.sendActivity).mock.calls;
    expect(calls.map((call) => call[1])).not.toContain('followers');
    expect(calls).toHaveLength(2);
    expect(calls[0]?.[1]).toMatchObject({ id: new URL(alice.id) });
    expect(calls[1]?.[1]).toEqual([{ id: new URL(bob.id), inboxId: new URL(bob.inboxUrl), endpoints: null }]);
    expect(calls[1]?.[3]).toEqual({ preferSharedInbox: false });
    const note = await noteOf(calls[0] ?? []);
    expect(note.toIds.map((url) => url.href)).toEqual([bob.id, alice.id]);
    expect(note.ccIds).toEqual([]);
    expect(vi.mocked(deps.postCreatedStore.store).mock.calls[0]?.[0]?.eventPayload).toMatchObject({
      participantActorUris: ['https://example.com/users/kosui', alice.id, bob.id],
    });
  });

  it('親がローカルの direct の返信は followers に送らず、mentions の相手にだけ送る', async () => {
    const { deps, session, localParent } = setup();
    const ctx = createContext();

    const result = await SendReplyUseCase.create(deps).run({
      sessionId: session.sessionId,
      postId: localParent.postId,
      content: `<p>${mentionHtml(alice.id, 'alice@remote.example')} hi</p>`,
      imageUrls: [],
      visibility: 'direct',
      mentions: [alice],
      request: new Request('https://example.com'),
      ctx,
    });

    expect(result.ok).toBe(true);
    const calls = vi.mocked(ctx.sendActivity).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toEqual([{ id: new URL(alice.id), inboxId: new URL(alice.inboxUrl), endpoints: null }]);
    expect(calls[0]?.[3]).toEqual({ preferSharedInbox: false });
  });

  it('public の返信の参加者は保存しない', async () => {
    const { deps, session, localParent } = setup();

    await SendReplyUseCase.create(deps).run({
      sessionId: session.sessionId,
      postId: localParent.postId,
      content: `<p>${mentionHtml(alice.id, 'alice@remote.example')} hi</p>`,
      imageUrls: [],
      request: new Request('https://example.com'),
      ctx: createContext(),
    });

    expect(vi.mocked(deps.postCreatedStore.store).mock.calls[0]?.[0]?.eventPayload).toMatchObject({
      participantActorUris: [],
    });
  });
});
