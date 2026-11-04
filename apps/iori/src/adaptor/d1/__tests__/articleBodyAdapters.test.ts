import { describe, expect, it } from 'vitest';

import { ArticleId } from '../../../domain/article/articleId.ts';
import { ArticleBody } from '../../../domain/articleBody/articleBody.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { createD1ArticleBodyDeletedStore } from '../articleBody/articleBodyDeletedStore.ts';
import { createD1ArticleBodyResolver } from '../articleBody/articleBodyResolver.ts';
import { createD1ArticleBodyWrittenStore } from '../articleBody/articleBodyWrittenStore.ts';
import type { IoriD1Db } from '../client.ts';
import { articleBodiesTable, domainEventsTable } from '../schema.ts';

const queryDb = (rows: unknown[]): IoriD1Db => ({
  select: () => {
    const builder = {
      from: () => builder,
      where: () => builder,
      limit: () => builder,
      then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
    };
    return builder;
  },
} as unknown as IoriD1Db);

const recordingDb = () => {
  const batches: unknown[][] = [];
  const db = {
    insert: (table: unknown) => ({
      values: (values: unknown) => ({
        kind: 'insert',
        table,
        values,
        onConflictDoUpdate: (config: unknown) => ({ kind: 'upsert', table, values, config }),
      }),
    }),
    delete: (table: unknown) => ({ where: () => ({ kind: 'delete', table }) }),
    batch: async (items: unknown[]) => batches.push(items),
  } as unknown as IoriD1Db;
  return { db, batches } as const;
};

describe('D1 article body adapters', () => {
  const now = Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z'));

  it('reconstructs an article body and returns undefined when there is none', async () => {
    const articleId = ArticleId.generate();
    const row = { articleId, privateHtml: '<p>private</p>', publicHtml: '<p>public</p>', updatedAt: new Date(now) };

    const found = await createD1ArticleBodyResolver(queryDb([row])).resolve(articleId);
    const missing = await createD1ArticleBodyResolver(queryDb([])).resolve(articleId);

    expect(found).toEqual({
      ok: true,
      val: { articleId, privateHtml: '<p>private</p>', publicHtml: '<p>public</p>', updatedAt: now },
    });
    expect(missing).toEqual({ ok: true, val: undefined });
  });

  it('upserts the body together with its domain event in one batch', async () => {
    const { db, batches } = recordingDb();
    const written = ArticleBody.writeArticleBody(now)({
      articleId: ArticleId.generate(),
      privateHtml: '<p>private</p>',
      publicHtml: '<p>public</p>',
      markdown: 'public',
    });

    await createD1ArticleBodyWrittenStore(db).store(written);

    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject([
      {
        kind: 'upsert',
        table: articleBodiesTable,
        values: {
          articleId: written.aggregateId,
          privateHtml: '<p>private</p>',
          publicHtml: '<p>public</p>',
          markdown: 'public',
        },
      },
      { kind: 'insert', table: domainEventsTable, values: { eventName: 'articleBody.written' } },
    ]);
  });

  it('deletes the body together with its domain event in one batch', async () => {
    const { db, batches } = recordingDb();
    const deleted = ArticleBody.deleteArticleBody(now)(ArticleId.generate());

    await createD1ArticleBodyDeletedStore(db).store(deleted);

    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject([
      { kind: 'delete', table: articleBodiesTable },
      { kind: 'insert', table: domainEventsTable, values: { eventName: 'articleBody.deleted' } },
    ]);
  });
});
