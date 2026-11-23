import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { Article, ArticleResolver, ArticleWithDependentsDeletedStore } from '../../domain/article/article.ts';
import { ArticleId } from '../../domain/article/articleId.ts';
import type { ArticleBody, ArticleBodyResolver } from '../../domain/articleBody/articleBody.ts';
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
    title: 'Draft',
    status: 'draft',
    createdAt: Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z')),
    publishedAt: null,
    unpublishedAt: null,
  };
  const body: ArticleBody = {
    articleId: article.articleId,
    privateHtml: '<p>private</p>',
    publicHtml: '<p>public</p>',
    markdown: null,
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
  const articleBodyResolver: ArticleBodyResolver = {
    resolve: vi.fn(async () => RA.ok(options.hasBody ? body : undefined)) as unknown as ArticleBodyResolver['resolve'],
  };
  const articleWithDependentsDeletedStore: ArticleWithDependentsDeletedStore = {
    store: vi.fn(async () => RA.ok(undefined)),
  };
  const deps = {
    sessionResolver,
    userResolver,
    actorResolverByUserId,
    articleResolver,
    articleBodyResolver,
    articleWithDependentsDeletedStore,
  };
  return { deps, session, article, articleWithDependentsDeletedStore };
};

describe('DeleteArticleUseCase', () => {
  const run = (deps: ReturnType<typeof setup>['deps'], session: Session, article: Article) =>
    DeleteArticleUseCase.create(deps).run({
      sessionId: session.sessionId,
      articleId: article.articleId,
      ctx: createMockRequestContext(),
    });

  it('本文がある article は、article と本文の削除イベントを1回の store 呼び出しで渡す', async () => {
    const { deps, session, article, articleWithDependentsDeletedStore } = setup({ hasBody: true });

    const result = await run(deps, session, article);

    expect(result).toEqual({ ok: true, val: { success: true } });
    expect(articleWithDependentsDeletedStore.store).toHaveBeenCalledTimes(1);
    expect(articleWithDependentsDeletedStore.store).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'article.deleted', aggregateId: article.articleId }),
      expect.objectContaining({
        eventName: 'articleBody.deleted',
        aggregateId: article.articleId,
        aggregateState: undefined,
      }),
    );
  });

  it('本文がない article は article の削除イベントだけを渡す', async () => {
    const { deps, session, article, articleWithDependentsDeletedStore } = setup({ hasBody: false });

    const result = await run(deps, session, article);

    expect(result.ok).toBe(true);
    expect(articleWithDependentsDeletedStore.store).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'article.deleted' }),
      undefined,
    );
  });
});
