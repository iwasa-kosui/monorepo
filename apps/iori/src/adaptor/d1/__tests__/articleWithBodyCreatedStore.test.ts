import { describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { Article } from '../../../domain/article/article.ts';
import { ArticleBody } from '../../../domain/articleBody/articleBody.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1ArticleWithBodyCreatedStore } from '../article/articleWithBodyCreatedStore.ts';
import type { IoriD1Db } from '../client.ts';
import { articleBodiesTable, articlesTable, domainEventsTable } from '../schema.ts';

const recordingDb = () => {
  const batches: unknown[][] = [];
  const db = {
    insert: (table: unknown) => ({ values: (values: unknown) => ({ kind: 'insert', table, values }) }),
    batch: async (items: unknown[]) => batches.push(items),
  } as unknown as IoriD1Db;
  return { db, batches } as const;
};

describe('createD1ArticleWithBodyCreatedStore', () => {
  const now = Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z'));

  it('article、本文、2件の domain event を1回の batch で書く', async () => {
    const { db, batches } = recordingDb();
    const articleCreated = Article.createArticle(now)({
      authorActorId: ActorId.generate(),
      authorUserId: UserId.generate(),
      rootPostId: null,
      title: 'Digest',
    });
    const bodyWritten = ArticleBody.writeArticleBody(now)({
      articleId: articleCreated.aggregateState.articleId,
      privateHtml: '<p>private</p>',
      publicHtml: '<p>public</p>',
    });

    await createD1ArticleWithBodyCreatedStore(db).store(articleCreated, bodyWritten);

    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject([
      { kind: 'insert', table: articlesTable, values: { articleId: articleCreated.aggregateId, title: 'Digest' } },
      {
        kind: 'insert',
        table: articleBodiesTable,
        values: { articleId: articleCreated.aggregateId, privateHtml: '<p>private</p>', publicHtml: '<p>public</p>' },
      },
      { kind: 'insert', table: domainEventsTable, values: { eventName: 'article.created' } },
      { kind: 'insert', table: domainEventsTable, values: { eventName: 'articleBody.written' } },
    ]);
  });
});
