import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { Article, ArticlePublishedStore, ArticleResolver } from '../../domain/article/article.ts';
import { ArticleId } from '../../domain/article/articleId.ts';
import type { ArticleBody, ArticleBodyResolver } from '../../domain/articleBody/articleBody.ts';
import { Digest, type DigestResolverByArticleId } from '../../domain/digest/digest.ts';
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

type DigestKind = 'none' | 'topic' | 'summary' | 'legacySummary';

const createDigest = (kind: DigestKind, article: Article): Digest | undefined => {
  if (kind === 'none') return undefined;
  const created = Digest.create({
    userId: article.authorUserId,
    digestDate: '2026-08-05',
    articleId: article.articleId,
    trigger: 'scheduled',
    topicKey: kind === 'topic' ? 'genai' : 'summary',
    items: kind === 'summary'
      ? []
      : [{
        feedEntryId: 'e1',
        url: 'https://example.com/1',
        title: '1',
        rank: 1,
        score: null,
        summary: null,
        reasonInterestSourceId: null,
        feedback: null,
        feedbackAt: null,
      }],
    trends: [],
    xPostFeedEntryIds: [],
  }, Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z')));
  if (!created.ok) throw new Error('unexpected');
  return created.val.aggregateState;
};

const setup = (options: Readonly<{ rootPostId: PostId | null; hasBody: boolean; digest?: DigestKind }>) => {
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
  const articlePublishedStore: ArticlePublishedStore = { store: vi.fn(async () => RA.ok(undefined)) };
  const resolveBody = vi.fn(async () => RA.ok(options.hasBody ? body : undefined));
  const articleBodyResolver: ArticleBodyResolver = {
    resolve: resolveBody as unknown as ArticleBodyResolver['resolve'],
  };
  const digest = createDigest(options.digest ?? 'none', article);
  const digestResolverByArticleId: DigestResolverByArticleId = {
    resolve: vi.fn(async () => RA.ok(digest)) as unknown as DigestResolverByArticleId['resolve'],
  };
  const deps = {
    sessionResolver,
    userResolver,
    actorResolverByUserId,
    articleResolver,
    articlePublishedStore,
    articleBodyResolver,
    digestResolverByArticleId,
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

  it('新形式のまとめ（項目を持たない summary の digest）の article は DigestSummaryNotPublishableError で拒否する', async () => {
    const { deps, session, article, articlePublishedStore } = setup({
      rootPostId: null,
      hasBody: true,
      digest: 'summary',
    });

    const result = await PublishArticleUseCase.create(deps).run({
      sessionId: session.sessionId,
      articleId: article.articleId,
      ctx: createMockRequestContext(),
    });

    expect(result).toMatchObject({
      ok: false,
      err: { type: 'DigestSummaryNotPublishableError', message: 'このまとめは公開できません' },
    });
    expect(articlePublishedStore.store).not.toHaveBeenCalled();
  });

  it.each(['legacySummary', 'topic'] as const)('%s の digest の article は公開できる', async (digest) => {
    const { deps, session, article, articlePublishedStore } = setup({ rootPostId: null, hasBody: true, digest });

    const result = await PublishArticleUseCase.create(deps).run({
      sessionId: session.sessionId,
      articleId: article.articleId,
      ctx: createMockRequestContext(),
    });

    expect(result.ok).toBe(true);
    expect(articlePublishedStore.store).toHaveBeenCalledTimes(1);
  });
});
