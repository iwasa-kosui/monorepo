import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { Article, ArticlePublishedStore, ArticleResolver } from '../../domain/article/article.ts';
import { ArticleId } from '../../domain/article/articleId.ts';
import type { ArticleBody, ArticleBodyResolver } from '../../domain/articleBody/articleBody.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { PostId } from '../../domain/post/postId.ts';
import type { Session } from '../../domain/session/session.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { PublishArticleUseCase } from '../publishArticle.ts';
import {
  createMockActorResolverByUserId,
  createMockRequestContext,
  createMockSessionResolver,
  createMockUserResolver,
} from './helper/mockAdaptors.ts';

const setup = (options: Readonly<{ rootPostId: PostId | null; hasBody: boolean }>) => {
  const user: User = { id: crypto.randomUUID() as User['id'], username: 'kosui' as Username };
  const session: Session = {
    sessionId: crypto.randomUUID() as Session['sessionId'],
    userId: user.id,
    expires: (Date.now() + 60_000) as Session['expires'],
  };
  const actor: LocalActor = {
    id: crypto.randomUUID() as LocalActor['id'],
    userId: user.id,
    uri: 'https://example.com/users/kosui',
    inboxUrl: 'https://example.com/inbox',
    type: 'local',
    logoUri: undefined,
  };
  const article: Article = {
    articleId: ArticleId.generate(),
    authorActorId: actor.id,
    authorUserId: user.id,
    rootPostId: options.rootPostId,
    title: 'Digest',
    status: 'draft',
    createdAt: Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z')),
    publishedAt: null,
    unpublishedAt: null,
  };
  const body: ArticleBody = {
    articleId: article.articleId,
    privateHtml: '<p>private</p>',
    publicHtml: '<p>public</p>',
    updatedAt: Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z')),
  };
  const sessionResolver = createMockSessionResolver();
  sessionResolver.setSession(session);
  const userResolver = createMockUserResolver();
  userResolver.setUser(user);
  const actorResolverByUserId = createMockActorResolverByUserId();
  actorResolverByUserId.setActor(actor);
  const articleResolver: ArticleResolver = {
    resolve: vi.fn(async () => RA.ok(article)) as unknown as ArticleResolver['resolve'],
  };
  const articlePublishedStore: ArticlePublishedStore = { store: vi.fn(async () => RA.ok(undefined)) };
  const resolveBody = vi.fn(async () => RA.ok(options.hasBody ? body : undefined));
  const articleBodyResolver: ArticleBodyResolver = {
    resolve: resolveBody as unknown as ArticleBodyResolver['resolve'],
  };
  const deps = {
    sessionResolver,
    userResolver,
    actorResolverByUserId,
    articleResolver,
    articlePublishedStore,
    articleBodyResolver,
  };
  return { deps, session, article, articlePublishedStore, resolveBody };
};

describe('PublishArticleUseCase', () => {
  it('rootPostId が null で本文が無い article の公開を ArticleBodyMissingError で拒否する', async () => {
    const { deps, session, article, articlePublishedStore } = setup({ rootPostId: null, hasBody: false });

    const result = await PublishArticleUseCase.create(deps).run({
      sessionId: session.sessionId,
      articleId: article.articleId,
      ctx: createMockRequestContext(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.err.type).toBe('ArticleBodyMissingError');
    }
    expect(articlePublishedStore.store).not.toHaveBeenCalled();
  });

  it('rootPostId が null で本文がある article は公開する', async () => {
    const { deps, session, article, articlePublishedStore } = setup({ rootPostId: null, hasBody: true });

    const result = await PublishArticleUseCase.create(deps).run({
      sessionId: session.sessionId,
      articleId: article.articleId,
      ctx: createMockRequestContext(),
    });

    expect(result.ok).toBe(true);
    expect(articlePublishedStore.store).toHaveBeenCalledTimes(1);
  });

  it('rootPostId がある article は本文を確かめずに公開する', async () => {
    const { deps, session, article, articlePublishedStore, resolveBody } = setup({
      rootPostId: PostId.generate(),
      hasBody: false,
    });

    const result = await PublishArticleUseCase.create(deps).run({
      sessionId: session.sessionId,
      articleId: article.articleId,
      ctx: createMockRequestContext(),
    });

    expect(result.ok).toBe(true);
    expect(resolveBody).not.toHaveBeenCalled();
    expect(articlePublishedStore.store).toHaveBeenCalledTimes(1);
  });
});
