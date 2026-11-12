import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { ArticleCreatedStore, ArticleResolverByRootPostId } from '../../domain/article/article.ts';
import type { LocalPost } from '../../domain/post/post.ts';
import type { PostId } from '../../domain/post/postId.ts';
import type { Session } from '../../domain/session/session.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { CreateArticleUseCase } from '../createArticle.ts';
import {
  createMockActorResolverByUserId,
  createMockPostResolver,
  createMockSessionResolver,
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
    content: 'root',
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
  const articleCreatedStore: ArticleCreatedStore = { store: vi.fn(async () => RA.ok(undefined)) } as never;
  const deps = {
    sessionResolver,
    userResolver,
    actorResolverByUserId,
    postResolver,
    articleResolverByRootPostId: {
      resolve: vi.fn(async () => RA.ok(undefined)),
    } as unknown as ArticleResolverByRootPostId,
    articleCreatedStore,
  };
  return { deps, session, post };
};

describe('CreateArticleUseCase のルート投稿の公開範囲', () => {
  it.each(['unlisted', 'private'] as const)(
    'visibility が %s のルート投稿からは記事を作らない',
    async (visibility) => {
      const { deps, session, post } = setup(visibility);

      const result = await CreateArticleUseCase.create(deps).run({
        sessionId: session.sessionId,
        rootPostId: post.postId,
        title: 'title',
      });

      expect(!result.ok && result.err.type).toBe('ArticleRootNotPublicError');
      expect(deps.articleCreatedStore.store).not.toHaveBeenCalled();
    },
  );

  it('visibility が public のルート投稿からは記事を作る', async () => {
    const { deps, session, post } = setup('public');

    const result = await CreateArticleUseCase.create(deps).run({
      sessionId: session.sessionId,
      rootPostId: post.postId,
      title: 'title',
    });

    expect(result.ok).toBe(true);
    expect(deps.articleCreatedStore.store).toHaveBeenCalledTimes(1);
  });
});
