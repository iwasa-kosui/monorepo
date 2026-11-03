import { RA } from '@iwasa-kosui/result';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { Article, ArticleResolver, ArticleWithDependentsDeletedStore } from '../../domain/article/article.ts';
import { ArticleId } from '../../domain/article/articleId.ts';
import type { ArticleBody, ArticleBodyResolver } from '../../domain/articleBody/articleBody.ts';
import type { DigestHeader, DigestHeaderResolverByArticleId } from '../../domain/digest/digest.ts';
import { DigestId } from '../../domain/digest/digestId.ts';
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

const setup = (options: Readonly<{ hasBody: boolean; hasDigest: boolean }>) => {
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
  const digestHeader: DigestHeader = {
    digestId: DigestId.generate(),
    userId: user.id,
    digestDate: '2026-08-05',
    articleId: article.articleId,
    createdAt: Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z')),
    pushSentAt: null,
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
  const digestHeaderResolverByArticleId: DigestHeaderResolverByArticleId = {
    resolve: vi.fn(async () => RA.ok(options.hasDigest ? digestHeader : undefined)) as unknown as
      DigestHeaderResolverByArticleId['resolve'],
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
    digestHeaderResolverByArticleId,
    articleWithDependentsDeletedStore,
  };
  return { deps, session, article, digestHeader, articleWithDependentsDeletedStore };
};

describe('DeleteArticleUseCase', () => {
  const run = (deps: ReturnType<typeof setup>['deps'], session: Session, article: Article) =>
    DeleteArticleUseCase.create(deps).run({
      sessionId: session.sessionId,
      articleId: article.articleId,
      ctx: createMockRequestContext(),
    });

  it('ダイジェストの article は、article、本文、digest の削除イベントを1回の store 呼び出しで渡す', async () => {
    const { deps, session, article, digestHeader, articleWithDependentsDeletedStore } = setup({
      hasBody: true,
      hasDigest: true,
    });

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
      expect.objectContaining({
        eventName: 'digest.expired',
        eventPayload: { digestId: digestHeader.digestId, digestDate: digestHeader.digestDate },
      }),
    );
  });

  it('本文だけある article は、digest の削除イベントを渡さない', async () => {
    const { deps, session, article, articleWithDependentsDeletedStore } = setup({ hasBody: true, hasDigest: false });

    const result = await run(deps, session, article);

    expect(result.ok).toBe(true);
    expect(articleWithDependentsDeletedStore.store).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'article.deleted' }),
      expect.objectContaining({ eventName: 'articleBody.deleted' }),
      undefined,
    );
  });

  it('本文も digest もない article は article の削除イベントだけを渡す', async () => {
    const { deps, session, article, articleWithDependentsDeletedStore } = setup({ hasBody: false, hasDigest: false });

    const result = await run(deps, session, article);

    expect(result.ok).toBe(true);
    expect(articleWithDependentsDeletedStore.store).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'article.deleted' }),
      undefined,
      undefined,
    );
  });

  it('articleBodyResolver、digestHeaderResolverByArticleId、articleWithDependentsDeletedStore のどれが欠けても型エラーになる', () => {
    const { deps } = setup({ hasBody: true, hasDigest: true });
    const { articleBodyResolver: _bodyResolver, ...withoutBodyResolver } = deps;
    const { digestHeaderResolverByArticleId: _digestResolver, ...withoutDigestResolver } = deps;
    const { articleWithDependentsDeletedStore: _store, ...withoutStore } = deps;
    type CreateDeps = Parameters<typeof DeleteArticleUseCase.create>[0];

    expectTypeOf(deps).toExtend<CreateDeps>();
    expectTypeOf(withoutBodyResolver).not.toExtend<CreateDeps>();
    expectTypeOf(withoutDigestResolver).not.toExtend<CreateDeps>();
    expectTypeOf(withoutStore).not.toExtend<CreateDeps>();
  });
});
