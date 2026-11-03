import { RA } from '@iwasa-kosui/result';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { Article, ArticleDeletedStore, ArticleResolver } from '../../domain/article/article.ts';
import { ArticleId } from '../../domain/article/articleId.ts';
import type {
  ArticleBody,
  ArticleBodyDeletedStore,
  ArticleBodyResolver,
} from '../../domain/articleBody/articleBody.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type { Session } from '../../domain/session/session.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { DeleteArticleUseCase } from '../deleteArticle.ts';
import {
  createMockActorResolverByUserId,
  createMockRequestContext,
  createMockSessionResolver,
  createMockUserResolver,
} from './helper/mockAdaptors.ts';

const setup = (options: Readonly<{ hasBody: boolean }>) => {
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
    rootPostId: null,
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
  const calls: string[] = [];
  const articleResolver: ArticleResolver = {
    resolve: vi.fn(async () => RA.ok(article)) as unknown as ArticleResolver['resolve'],
  };
  const articleDeletedStore: ArticleDeletedStore = {
    store: vi.fn(async () => {
      calls.push('article.deleted');
      return RA.ok(undefined);
    }),
  };
  const articleBodyResolver: ArticleBodyResolver = {
    resolve: vi.fn(async () => RA.ok(options.hasBody ? body : undefined)) as unknown as ArticleBodyResolver['resolve'],
  };
  const articleBodyDeletedStore: ArticleBodyDeletedStore = {
    store: vi.fn(async () => {
      calls.push('articleBody.deleted');
      return RA.ok(undefined);
    }),
  };
  const deps = {
    sessionResolver,
    userResolver,
    actorResolverByUserId,
    articleResolver,
    articleDeletedStore,
    articleBodyResolver,
    articleBodyDeletedStore,
  };
  return { deps, session, article, calls, articleBodyDeletedStore };
};

describe('DeleteArticleUseCase', () => {
  it('本文がある article は、本文の articleBody.deleted を保存してから article を消す', async () => {
    const { deps, session, article, calls, articleBodyDeletedStore } = setup({ hasBody: true });

    const result = await DeleteArticleUseCase.create(deps).run({
      sessionId: session.sessionId,
      articleId: article.articleId,
      ctx: createMockRequestContext(),
    });

    expect(result).toEqual({ ok: true, val: { success: true } });
    expect(calls).toEqual(['articleBody.deleted', 'article.deleted']);
    expect(articleBodyDeletedStore.store).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'articleBody.deleted',
        aggregateId: article.articleId,
        aggregateState: undefined,
      }),
    );
  });

  it('本文がない article は article だけを消す', async () => {
    const { deps, session, article, calls } = setup({ hasBody: false });

    const result = await DeleteArticleUseCase.create(deps).run({
      sessionId: session.sessionId,
      articleId: article.articleId,
      ctx: createMockRequestContext(),
    });

    expect(result.ok).toBe(true);
    expect(calls).toEqual(['article.deleted']);
  });

  it('articleBodyResolver と articleBodyDeletedStore のどちらが欠けても型エラーになる', () => {
    const { deps } = setup({ hasBody: true });
    const { articleBodyResolver: _resolver, ...withoutResolver } = deps;
    const { articleBodyDeletedStore: _store, ...withoutStore } = deps;
    type CreateDeps = Parameters<typeof DeleteArticleUseCase.create>[0];

    expectTypeOf(deps).toExtend<CreateDeps>();
    expectTypeOf(withoutResolver).not.toExtend<CreateDeps>();
    expectTypeOf(withoutStore).not.toExtend<CreateDeps>();
  });
});
