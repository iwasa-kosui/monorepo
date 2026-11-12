import { Create, Mention, Note, Person } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { LocalPost, PostQuote, PostQuotesResolverByPostIds, RemotePost } from '../../domain/post/post.ts';
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

const quoteUri = 'https://remote.example/users/alice/statuses/1';
const aliceId = 'https://remote.example/users/alice';
const aliceQuote: PostQuote = {
  uri: quoteUri,
  author: { id: aliceId, inboxUrl: `${aliceId}/inbox`, username: 'alice' },
};

const createContext = () =>
  Object.assign(createMockRequestContext(), {
    getFollowersUri: vi.fn((username: string) => new URL(`https://example.com/users/${username}/followers`)),
    getDocumentLoader: vi.fn(async () => ({})),
    lookupObject: vi.fn(async (): Promise<unknown> => null),
  });

const setup = (parent: 'local' | 'remote', quote: PostQuote | undefined = aliceQuote) => {
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
  const base = {
    postId: crypto.randomUUID() as PostId,
    actorId: actor.id,
    content: 'parent',
    createdAt: Date.now() as LocalPost['createdAt'],
    inReplyToUri: null,
    summary: null,
    sensitive: false,
  };
  const parentPost: LocalPost | RemotePost = parent === 'local'
    ? { ...base, type: 'local', userId: user.id }
    : { ...base, type: 'remote', uri: 'https://bob.example/notes/1', visibility: 'public' };
  const sessionResolver = createMockSessionResolver();
  sessionResolver.setSession(session);
  const userResolver = createMockUserResolver();
  userResolver.setUser(user);
  const actorResolverByUserId = createMockActorResolverByUserId();
  actorResolverByUserId.setActor(actor);
  const postResolver = createMockPostResolver();
  postResolver.setPost(parentPost);
  const postCreatedStore = createMockPostCreatedStore();
  const postQuotesResolver: PostQuotesResolverByPostIds = {
    resolve: vi.fn((postIds: ReadonlyArray<PostId>) =>
      RA.ok(new Map<PostId, PostQuote>(quote === undefined ? [] : postIds.map((postId) => [postId, quote])))
    ),
  };
  const useCase = SendReplyUseCase.create({
    sessionResolver,
    userResolver,
    actorResolverByUserId,
    postCreatedStore,
    postImageCreatedStore: createMockPostImageCreatedStore(),
    timelineItemCreatedStore: createMockTimelineItemCreatedStore(),
    localPostResolverByUri: createMockLocalPostResolverByUri(),
    replyNotificationCreatedStore: createMockReplyNotificationCreatedStore(),
    pushSubscriptionsResolver: createMockPushSubscriptionsResolverByUserId(),
    webPushSender: createMockWebPushSender(),
    postResolver,
    postQuotesResolver,
    origin: 'https://example.com',
  });
  const run = async (input: { content: string; quoteUri?: string }) => {
    const ctx = createContext();
    if (parent === 'remote') {
      const bob = new Person({
        id: new URL('https://bob.example/users/bob'),
        inbox: new URL('https://bob.example/users/bob/inbox'),
        preferredUsername: 'bob',
      });
      vi.mocked(ctx.lookupObject).mockResolvedValue(
        new Note({ id: new URL('https://bob.example/notes/1'), attribution: bob }),
      );
    }
    const result = await useCase.run({
      sessionId: session.sessionId,
      postId: parentPost.postId,
      imageUrls: [],
      request: new Request('https://example.com'),
      ctx,
      ...input,
    });
    const sent = vi.mocked(ctx.sendActivity).mock.calls.map(([, recipients, activity]) => ({
      recipients,
      create: activity as Create,
    }));
    return { result, ctx, sent };
  };
  return { run, postCreatedStore, parentPost };
};

const noteOf = async (create: Create): Promise<Note> => (await create.getObject()) as Note;

describe('SendReplyUseCase の引用', () => {
  it('返信かつ引用: 返信先の URI と引用先の URI を投稿に持たせ、本文に RE: の段落を足す', async () => {
    const { run, postCreatedStore } = setup('local');

    const { result } = await run({ content: '<p>reply</p>', quoteUri });

    const expected = `<p>reply</p><p>RE: <a href="${quoteUri}">${quoteUri}</a></p>`;
    expect(result.ok && result.val.post.content).toBe(expected);
    const [event] = postCreatedStore.items;
    expect(event?.eventPayload.quoteUri).toBe(quoteUri);
    expect(event?.aggregateState).toMatchObject({
      content: expected,
      inReplyToUri: expect.stringContaining('/posts/'),
    });
  });

  it('本文に引用先へのリンクが既にあれば、段落を足さない', async () => {
    const { run } = setup('local');
    const content = `<p><a href="${quoteUri}">quoted</a></p>`;

    const { result } = await run({ content, quoteUri });

    expect(result.ok && result.val.post.content).toBe(content);
  });

  it('返信先がローカルでも、配送する Note に quoteUrl と引用先の作者の Mention と cc を付ける', async () => {
    const { run } = setup('local');

    const { sent } = await run({ content: '<p>reply</p>', quoteUri });

    const followers = sent.find((call) => call.recipients === 'followers');
    const note = await noteOf(followers!.create);
    expect(note.quoteUrl?.href).toBe(quoteUri);
    expect(note.replyTargetId).not.toBeNull();
    expect(note.ccIds.map((url) => url.href)).toEqual(['https://example.com/users/kosui/followers', aliceId]);
    const tags = await Array.fromAsync(note.getTags());
    expect(tags).toHaveLength(1);
    expect(tags[0]).toBeInstanceOf(Mention);
    expect((tags[0] as Mention).href?.href).toBe(aliceId);
    expect((tags[0] as Mention).name?.toString()).toBe('@alice@remote.example');
    const json = await note.toJsonLd({ format: 'compact' }) as Record<string, unknown>;
    expect(json).toMatchObject({ quoteUrl: quoteUri, _misskey_quote: quoteUri, quoteUri });
    expect(json).not.toHaveProperty('quote');
    expect(json).not.toHaveProperty('quoteAuthorization');
    expect(json).not.toHaveProperty('interactionPolicy');
  });

  it('返信先がローカルのとき、引用先の作者の inbox に配送する', async () => {
    const { run } = setup('local');

    const { sent } = await run({ content: '<p>reply</p>', quoteUri });

    expect(sent.map((call) => call.recipients)).toEqual([
      'followers',
      [{ id: new URL(aliceId), inboxId: new URL(`${aliceId}/inbox`), endpoints: null }],
    ]);
  });

  it('返信先がリモートなら、返信先の作者と引用先の作者の両方を Mention と cc に入れて、それぞれの inbox に配送する', async () => {
    const { run } = setup('remote');

    const { result, sent } = await run({ content: '<p>reply</p>', quoteUri });

    expect(result.ok).toBe(true);
    const note = await noteOf(sent[0]!.create);
    expect(note.quoteUrl?.href).toBe(quoteUri);
    expect(note.ccIds.map((url) => url.href)).toEqual([
      'https://example.com/users/kosui/followers',
      'https://bob.example/users/bob',
      aliceId,
    ]);
    const hrefs = (await Array.fromAsync(note.getTags())).map((tag) => (tag as Mention).href?.href);
    expect(hrefs).toEqual(['https://bob.example/users/bob', aliceId]);
    expect(sent.map((call) => call.recipients).slice(1)).toEqual([
      'followers',
      [{ id: new URL(aliceId), inboxId: new URL(`${aliceId}/inbox`), endpoints: null }],
    ]);
  });

  it('引用先が返信先の作者の投稿なら、その作者には 1 回だけ配送する', async () => {
    const bob: PostQuote = {
      uri: 'https://bob.example/notes/2',
      author: { id: 'https://bob.example/users/bob', inboxUrl: 'https://bob.example/users/bob/inbox', username: 'bob' },
    };
    const { run } = setup('remote', bob);

    const { sent } = await run({ content: '<p>reply</p>', quoteUri: bob.uri });

    expect(sent.map((call) => call.recipients)).toEqual([
      expect.objectContaining({ id: new URL('https://bob.example/users/bob') }),
      'followers',
    ]);
    const note = await noteOf(sent[0]!.create);
    expect((await Array.fromAsync(note.getTags())).length).toBe(1);
  });

  it('引用先が無ければ quoteUrl を付けず、本文も変えない', async () => {
    const { run, postCreatedStore } = setup('local');

    const { sent } = await run({ content: '<p>reply</p>' });

    const note = await noteOf(sent[0]!.create);
    expect(note.quoteUrl).toBeNull();
    expect(postCreatedStore.items[0]?.eventPayload.quoteUri).toBeNull();
    expect(postCreatedStore.items[0]?.aggregateState.content).toBe('<p>reply</p>');
  });
});
