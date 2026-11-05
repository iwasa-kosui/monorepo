import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { ActorId } from '../../domain/actor/actorId.ts';
import type { Article, ArticleResolver, ArticleWithBodyEditedStore } from '../../domain/article/article.ts';
import { ArticleId } from '../../domain/article/articleId.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { UserId } from '../../domain/user/userId.ts';
import { EditArticleUseCase } from '../editArticle.ts';

const userId = UserId.generate();
const article: Article = {
  articleId: ArticleId.generate(),
  authorActorId: ActorId.generate(),
  authorUserId: userId,
  rootPostId: null,
  title: 'Before',
  status: 'draft',
  createdAt: Instant.orThrow(1_000),
  publishedAt: null,
  unpublishedAt: null,
};

const baseUpdatedAt = Instant.orThrow(1_000);
const published: Article = { ...article, status: 'published' };

const setup = (edited: boolean, resolveAfterStore: () => Article | undefined = () => article) => {
  let stored = false;
  const articleResolver: ArticleResolver = { resolve: async () => RA.ok(stored ? resolveAfterStore() : article) };
  const store = vi.fn<ArticleWithBodyEditedStore['store']>(async () => {
    stored = true;
    return RA.ok({ edited });
  });
  const useCase = EditArticleUseCase.create({
    articleResolver,
    articleWithBodyEditedStore: { store },
    renderMarkdown: async (markdown) => `<p>${markdown}</p>`,
  });
  return { useCase, store };
};

describe('EditArticleUseCase', () => {
  it('タイトルが変わったときは article.titleChanged と本文のイベントを渡す', async () => {
    const { useCase, store } = setup(true);

    const result = await useCase.run({
      userId,
      articleId: article.articleId,
      title: 'After',
      markdown: 'body',
      baseUpdatedAt,
    });

    expect(result).toMatchObject({ ok: true, val: { article: { title: 'After' } } });
    expect(store.mock.calls[0]![0]).toMatchObject({ eventName: 'article.titleChanged' });
    expect(store.mock.calls[0]![1]).toMatchObject({ eventName: 'articleBody.written' });
  });

  it('タイトルが今と同じなら article.titleChanged を渡さない', async () => {
    const { useCase, store } = setup(true);

    const result = await useCase.run({
      userId,
      articleId: article.articleId,
      title: 'Before',
      markdown: 'body',
      baseUpdatedAt,
    });

    expect(result).toMatchObject({ ok: true, val: { article: { title: 'Before' } } });
    expect(store.mock.calls[0]![0]).toBeUndefined();
  });

  it('ストアが書き込めなかったら（その間に公開された）ArticleInvalidStatusError を返す', async () => {
    const { useCase } = setup(false, () => published);

    const result = await useCase.run({
      userId,
      articleId: article.articleId,
      title: 'After',
      markdown: 'body',
      baseUpdatedAt,
    });

    expect(result).toMatchObject({
      ok: false,
      err: { type: 'ArticleInvalidStatusError', detail: { currentStatus: 'published' } },
    });
  });

  it('ストアが書き込めず、記事が消えていたら ArticleNotFoundError を返す', async () => {
    const { useCase } = setup(false, () => undefined);

    const result = await useCase.run({
      userId,
      articleId: article.articleId,
      title: 'After',
      markdown: 'body',
      baseUpdatedAt,
    });

    expect(result).toMatchObject({
      ok: false,
      err: { type: 'ArticleNotFoundError', detail: { articleId: article.articleId } },
    });
  });

  it('ストアが書き込めず、記事が下書きのままなら（本文が先に更新された）ArticleBodyConflictError を返す', async () => {
    const { useCase } = setup(false);

    const result = await useCase.run({
      userId,
      articleId: article.articleId,
      title: 'After',
      markdown: 'body',
      baseUpdatedAt,
    });

    expect(result).toMatchObject({
      ok: false,
      err: { type: 'ArticleBodyConflictError', detail: { articleId: article.articleId } },
    });
  });

  it('編集の開始時の版を、ストアの条件に渡す', async () => {
    const { useCase, store } = setup(true);

    await useCase.run({ userId, articleId: article.articleId, title: 'Before', markdown: 'body', baseUpdatedAt });

    expect(store.mock.calls[0]![2]).toBe(baseUpdatedAt);
  });

  it('本文の版は、編集の開始時の版より必ず新しくする', async () => {
    const { useCase, store } = setup(true);
    const future = Instant.orThrow(Date.now() + 60_000);

    await useCase.run({
      userId,
      articleId: article.articleId,
      title: 'Before',
      markdown: 'body',
      baseUpdatedAt: future,
    });

    expect(store.mock.calls[0]![1].aggregateState.updatedAt).toBe(future + 1);
  });
});
