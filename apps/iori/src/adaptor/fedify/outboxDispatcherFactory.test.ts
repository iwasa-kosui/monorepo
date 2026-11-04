import { type RequestContext } from '@fedify/fedify';
import { Create, Note } from '@fedify/vocab';
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
  it('保存済みの生の HTML は、配送する Note の content からサニタイズして除く', async () => {
    const userId = UserId.generate();
    const actorId = ActorId.generate();
    const post: LocalPost = {
      type: 'local',
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
});
