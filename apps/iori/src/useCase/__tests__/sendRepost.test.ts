import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { LocalPost, RemotePostUpserter } from '../../domain/post/post.ts';
import type { PostId } from '../../domain/post/postId.ts';
import type { RepostCreatedStore, RepostResolver } from '../../domain/repost/repost.ts';
import type { Session } from '../../domain/session/session.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { SendRepostUseCase } from '../sendRepost.ts';
import {
  createMockActorResolverByUserId,
  createMockArticleResolverByRootPostId,
  createMockPostResolver,
  createMockRequestContext,
  createMockSessionResolver,
  createMockTimelineItemCreatedStore,
  createMockUserResolver,
} from './helper/mockAdaptors.ts';

const setup = (visibility: LocalPost['visibility']) => {
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
  const post: LocalPost = {
    type: 'local',
    visibility,
    summary: null,
    sensitive: false,
    postId: crypto.randomUUID() as PostId,
    actorId: actor.id,
    content: 'mine',
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
  postResolver.setPost(post);
  const repostCreatedStore: RepostCreatedStore = { store: vi.fn(async () => RA.ok(undefined)) } as never;
  const timelineItemCreatedStore = createMockTimelineItemCreatedStore();
  const deps = {
    origin: 'https://example.com',
    sessionResolver,
    userResolver,
    actorResolverByUserId,
    repostCreatedStore,
    repostResolver: { resolve: vi.fn(async () => RA.ok(undefined)) } as unknown as RepostResolver,
    remotePostUpserter: { resolve: vi.fn() } as unknown as RemotePostUpserter,
    timelineItemCreatedStore,
    postResolver,
    articleResolverByRootPostId: createMockArticleResolverByRootPostId(),
  };
  return { deps, session, post };
};

describe('SendRepostUseCase のローカルの投稿', () => {
  it.each(['private', 'direct'] as const)(
    'visibility が %s の投稿は RepostNotAllowedError で拒否し、何も保存も配送もしない',
    async (visibility) => {
      const { deps, session, post } = setup(visibility);
      const ctx = createMockRequestContext();

      const result = await SendRepostUseCase.create(deps).run({
        sessionId: session.sessionId,
        postId: post.postId,
        request: new Request('https://example.com'),
        ctx,
      });

      expect(!result.ok && result.err.type).toBe('RepostNotAllowedError');
      expect(deps.repostCreatedStore.store).not.toHaveBeenCalled();
      expect(deps.timelineItemCreatedStore.store).not.toHaveBeenCalled();
      expect(ctx.sendActivity).not.toHaveBeenCalled();
    },
  );

  it.each(['public', 'unlisted'] as const)('visibility が %s の投稿はリポストできる', async (visibility) => {
    const { deps, session, post } = setup(visibility);
    const ctx = Object.assign(createMockRequestContext(), {
      getFollowersUri: vi.fn((identifier: string) => new URL(`https://example.com/users/${identifier}/followers`)),
    });

    const result = await SendRepostUseCase.create(deps).run({
      sessionId: session.sessionId,
      postId: post.postId,
      request: new Request('https://example.com'),
      ctx,
    });

    expect(result.ok).toBe(true);
    expect(deps.repostCreatedStore.store).toHaveBeenCalledTimes(1);
    expect(ctx.sendActivity).toHaveBeenCalledTimes(1);
  });
});
