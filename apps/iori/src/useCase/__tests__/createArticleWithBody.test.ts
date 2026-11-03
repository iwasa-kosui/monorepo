import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { ArticleCreated, ArticleCreatedStore } from '../../domain/article/article.ts';
import type { ArticleBodyWritten, ArticleBodyWrittenStore } from '../../domain/articleBody/articleBody.ts';
import { UserId } from '../../domain/user/userId.ts';
import { CreateArticleWithBodyUseCase } from '../createArticleWithBody.ts';
import { createMockActorResolverByUserId } from './helper/mockAdaptors.ts';

const createDeps = () => {
  const userId = UserId.generate();
  const actor: LocalActor = {
    id: crypto.randomUUID() as LocalActor['id'],
    userId,
    uri: 'https://example.com/users/kosui',
    inboxUrl: 'https://example.com/inbox',
    type: 'local',
    logoUri: undefined,
  };
  const actorResolverByUserId = createMockActorResolverByUserId();
  actorResolverByUserId.setActor(actor);
  const calls: string[] = [];
  const articleEvents: ArticleCreated[] = [];
  const bodyEvents: ArticleBodyWritten[] = [];
  const articleCreatedStore: ArticleCreatedStore = {
    store: vi.fn(async (...events) => {
      calls.push('article');
      articleEvents.push(...events);
      return RA.ok(undefined);
    }),
  };
  const articleBodyWrittenStore: ArticleBodyWrittenStore = {
    store: vi.fn(async (...events) => {
      calls.push('body');
      bodyEvents.push(...events);
      return RA.ok(undefined);
    }),
  };
  return {
    userId,
    actor,
    actorResolverByUserId,
    articleCreatedStore,
    articleBodyWrittenStore,
    calls,
    articleEvents,
    bodyEvents,
  };
};

describe('CreateArticleWithBodyUseCase', () => {
  it('rootPostId が null の draft の article と本文を、article、本文の順に保存する', async () => {
    const deps = createDeps();

    const result = await CreateArticleWithBodyUseCase.create(deps).run({
      userId: deps.userId,
      title: 'Digest',
      privateHtml: '<p>private</p>',
      publicHtml: '<p>public</p>',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.val.article).toMatchObject({
      title: 'Digest',
      status: 'draft',
      rootPostId: null,
      authorUserId: deps.userId,
      authorActorId: deps.actor.id,
    });
    expect(deps.calls).toEqual(['article', 'body']);
    expect(deps.bodyEvents).toHaveLength(1);
    expect(deps.bodyEvents[0]?.eventName).toBe('articleBody.written');
    expect(deps.bodyEvents[0]?.aggregateState).toMatchObject({
      articleId: result.val.article.articleId,
      privateHtml: '<p>private</p>',
      publicHtml: '<p>public</p>',
    });
  });

  it('保存の前に本文をサニタイズする', async () => {
    const deps = createDeps();

    await CreateArticleWithBodyUseCase.create(deps).run({
      userId: deps.userId,
      title: 'Digest',
      privateHtml: '<p>a</p><script>alert(1)</script>',
      publicHtml: '<a href="javascript:alert(1)">b</a><img src="https://example.com/a.png">',
    });

    expect(deps.bodyEvents[0]?.aggregateState).toMatchObject({
      privateHtml: '<p>a</p>',
      publicHtml: '<a rel="noopener noreferrer nofollow">b</a>',
    });
  });

  it('actor が解決できなければ UserNotFoundError を返し、何も保存しない', async () => {
    const deps = createDeps();

    const result = await CreateArticleWithBodyUseCase.create(deps).run({
      userId: UserId.generate(),
      title: 'Digest',
      privateHtml: '<p>a</p>',
      publicHtml: '<p>b</p>',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.err.type).toBe('UserNotFoundError');
    expect(deps.calls).toEqual([]);
  });
});
