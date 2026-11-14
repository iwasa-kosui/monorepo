import { describe, expect, it } from 'vitest';

import { ActorId } from '../actor/actorId.ts';
import { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';
import { Article } from './article.ts';

const createdAt = Instant.orThrow(1_000);
const changedAt = Instant.orThrow(2_000);

const article = Article.createArticle(createdAt)({
  authorActorId: ActorId.generate(),
  authorUserId: UserId.generate(),
  rootPostId: null,
  title: 'Before',
}).aggregateState;

describe('Article.changeArticleTitle', () => {
  it('タイトルだけを変えた article を持つ article.titleChanged を返す', () => {
    const result = Article.changeArticleTitle(changedAt)(article, 'After');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.val).toMatchObject({
      aggregateId: article.articleId,
      aggregateName: 'article',
      eventName: 'article.titleChanged',
      eventPayload: { articleId: article.articleId, title: 'After', changedAt },
      aggregateState: { ...article, title: 'After' },
      occurredAt: changedAt,
    });
  });
});

describe('Article.isBodyEdited', () => {
  it('本文の updatedAt が article の createdAt より後なら編集済み', () => {
    expect(Article.isBodyEdited(article, { updatedAt: Instant.orThrow(createdAt + 1) })).toBe(true);
  });

  it('本文の updatedAt が createdAt と同じなら未編集', () => {
    expect(Article.isBodyEdited(article, { updatedAt: createdAt })).toBe(false);
  });

  it('本文が無ければ未編集', () => {
    expect(Article.isBodyEdited(article, undefined)).toBe(false);
  });
});
