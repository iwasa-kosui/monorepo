import { type RequestContext } from '@fedify/fedify';
import { Create, Mention, Note } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { ActorId } from '../../domain/actor/actorId.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type { LocalPost } from '../../domain/post/post.ts';
import { PostId } from '../../domain/post/postId.ts';
import { UserId } from '../../domain/user/userId.ts';
import { Username } from '../../domain/user/username.ts';
import { createOutboxDispatcher } from './outboxDispatcherFactory.ts';

const createContext = () =>
  ({
    getObjectUri: (_type: unknown, values: { identifier: string; id: string }) =>
      new URL(`https://example.com/users/${values.identifier}/notes/${values.id}`),
    getActorUri: (identifier: string) => new URL(`https://example.com/users/${identifier}`),
    getFollowersUri: (identifier: string) => new URL(`https://example.com/users/${identifier}/followers`),
  }) as unknown as RequestContext<unknown>;

describe('createOutboxDispatcher', () => {
  it.each([
    { summary: 'cw', sensitive: true },
    { summary: null, sensitive: false },
  ])('summary $summary、sensitive $sensitive の投稿を Note の summary と sensitive に出す', async (fields) => {
    const userId = UserId.generate();
    const actorId = ActorId.generate();
    const post: LocalPost = {
      type: 'local',
      visibility: 'public',
      ...fields,
      postId: PostId.generate(),
      actorId,
      content: 'hello',
      createdAt: Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z')),
      userId,
      inReplyToUri: null,
    };
    const dispatcher = createOutboxDispatcher({
      userResolverByUsername: {
        resolve: vi.fn(async () => RA.ok({ id: userId, username: Username.orThrow('kosui') })),
      } as never,
      actorResolverByUserId: { resolve: vi.fn(async () => RA.ok({ id: actorId })) } as never,
      postsResolverByActorId: { resolve: vi.fn(async () => RA.ok([post])) } as never,
    });

    const result = await dispatcher.dispatch(createContext(), 'kosui');

    const note = (await (result.items[0] as Create).getObject()) as Note;
    expect(note.summary?.toString() ?? null).toBe(fields.summary);
    expect(note.sensitive).toBe(fields.sensitive);
  });

  it('保存済みの生の HTML は、配送する Note の content からサニタイズして除く', async () => {
    const userId = UserId.generate();
    const actorId = ActorId.generate();
    const post: LocalPost = {
      type: 'local',
      visibility: 'public',
      summary: null,
      sensitive: false,
      postId: PostId.generate(),
      actorId,
      content:
        '<p onclick="alert(1)">hi</p><script>alert(2)</script><a href="javascript:alert(3)">link</a><a href="https://example.com/">ok</a>',
      createdAt: Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z')),
      userId,
      inReplyToUri: null,
    };
    const dispatcher = createOutboxDispatcher({
      userResolverByUsername: {
        resolve: vi.fn(async () => RA.ok({ id: userId, username: Username.orThrow('kosui') })),
      } as never,
      actorResolverByUserId: { resolve: vi.fn(async () => RA.ok({ id: actorId })) } as never,
      postsResolverByActorId: { resolve: vi.fn(async () => RA.ok([post])) } as never,
    });

    const result = await dispatcher.dispatch(createContext(), 'kosui');

    expect(result.items).toHaveLength(1);
    const create = result.items[0] as Create;
    const note = await create.getObject();
    const content = (note as Note).content?.toString() ?? '';
    expect(content).not.toMatch(/<script|onclick|javascript:/i);
    expect(content).toContain('hi');
    expect(content).toContain('link');
    expect(content).toContain('href="https://example.com/"');
  });

  const dispatchContent = async (content: string) => {
    const userId = UserId.generate();
    const actorId = ActorId.generate();
    const post: LocalPost = {
      type: 'local',
      visibility: 'public',
      summary: null,
      sensitive: false,
      postId: PostId.generate(),
      actorId,
      content,
      createdAt: Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z')),
      userId,
      inReplyToUri: null,
    };
    const dispatcher = createOutboxDispatcher({
      userResolverByUsername: {
        resolve: vi.fn(async () => RA.ok({ id: userId, username: Username.orThrow('kosui') })),
      } as never,
      actorResolverByUserId: { resolve: vi.fn(async () => RA.ok({ id: actorId })) } as never,
      postsResolverByActorId: { resolve: vi.fn(async () => RA.ok([post])) } as never,
    });
    const result = await dispatcher.dispatch(createContext(), 'kosui');
    return (await (result.items[0] as Create).getObject()) as Note;
  };

  it('本文に a.mention のある投稿は、Mention タグを付け、相手の actor を followers に加えて cc に入れる', async () => {
    const note = await dispatchContent(
      '<p><span class="h-card"><a href="https://remote.example/users/alice" class="u-url mention">@<span>alice@remote.example</span></a></span> hi</p>',
    );

    expect(note.ccIds.map((url) => url.href)).toEqual([
      'https://example.com/users/kosui/followers',
      'https://remote.example/users/alice',
    ]);
    const tags = await Array.fromAsync(note.getTags());
    expect(tags).toHaveLength(1);
    expect(tags[0]).toBeInstanceOf(Mention);
    expect((tags[0] as Mention).href?.href).toBe('https://remote.example/users/alice');
  });

  it('メンションの無い投稿は、cc に followers だけを入れ、タグを付けない', async () => {
    const note = await dispatchContent('<p>hello</p>');

    expect(note.ccIds.map((url) => url.href)).toEqual(['https://example.com/users/kosui/followers']);
    await expect(Array.fromAsync(note.getTags())).resolves.toEqual([]);
  });

  const createLocalPost = (visibility: LocalPost['visibility'], userId: LocalPost['userId'], actorId: ActorId) =>
    ({
      type: 'local',
      visibility,
      summary: null,
      sensitive: false,
      postId: PostId.generate(),
      actorId,
      content: '<p>hello</p>',
      createdAt: Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z')),
      userId,
      inReplyToUri: null,
    }) satisfies LocalPost;

  const dispatchPosts = async (posts: ReadonlyArray<LocalPost>) => {
    const userId = UserId.generate();
    const actorId = ActorId.generate();
    const dispatcher = createOutboxDispatcher({
      userResolverByUsername: {
        resolve: vi.fn(async () => RA.ok({ id: userId, username: Username.orThrow('kosui') })),
      } as never,
      actorResolverByUserId: { resolve: vi.fn(async () => RA.ok({ id: actorId })) } as never,
      postsResolverByActorId: { resolve: vi.fn(async () => RA.ok(posts)) } as never,
    });
    return dispatcher.dispatch(createContext(), 'kosui');
  };

  it('unlisted の投稿は、to に followers、cc に Public を入れて載せる', async () => {
    const post = createLocalPost('unlisted', UserId.generate(), ActorId.generate());

    const result = await dispatchPosts([post]);

    expect(result.items).toHaveLength(1);
    const create = result.items[0] as Create;
    const note = (await create.getObject()) as Note;
    expect(note.toIds.map((url) => url.href)).toEqual(['https://example.com/users/kosui/followers']);
    expect(note.ccIds.map((url) => url.href)).toEqual(['https://www.w3.org/ns/activitystreams#Public']);
    expect(create.toIds.map((url) => url.href)).toEqual(['https://example.com/users/kosui/followers']);
    expect(create.ccIds.map((url) => url.href)).toEqual(['https://www.w3.org/ns/activitystreams#Public']);
  });

  it('private の投稿はアウトボックスに載せず、public と unlisted だけを載せる', async () => {
    const publicPost = createLocalPost('public', UserId.generate(), ActorId.generate());
    const unlistedPost = createLocalPost('unlisted', UserId.generate(), ActorId.generate());
    const privatePost = createLocalPost('private', UserId.generate(), ActorId.generate());

    const result = await dispatchPosts([publicPost, privatePost, unlistedPost]);

    const ids = result.items.map((item) => ((item as Create).objectId?.href ?? ''));
    expect(ids).toEqual([
      `https://example.com/users/kosui/notes/${publicPost.postId}`,
      `https://example.com/users/kosui/notes/${unlistedPost.postId}`,
    ]);
  });
});
