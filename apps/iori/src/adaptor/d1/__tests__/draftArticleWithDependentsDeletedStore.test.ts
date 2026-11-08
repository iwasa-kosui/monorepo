import { describe, expect, it } from 'vitest';

import { Article } from '../../../domain/article/article.ts';
import { ArticleId } from '../../../domain/article/articleId.ts';
import { ArticleBody } from '../../../domain/articleBody/articleBody.ts';
import { Digest } from '../../../domain/digest/digest.ts';
import { DigestId } from '../../../domain/digest/digestId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { createD1DraftArticleWithDependentsDeletedStore } from '../article/draftArticleWithDependentsDeletedStore.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const now = Instant.orThrow(Date.parse('2026-11-05T00:00:00.000Z'));

const setup = (status: string) => {
  const fixture = createSqliteD1Fixture();
  const author = createMastodonSeed(fixture).addLocalActor('kosui');
  const articleId = ArticleId.generate();
  const digestId = DigestId.generate();
  fixture.sqlite.prepare(
    'INSERT INTO articles(articleId,authorActorId,authorUserId,rootPostId,title,status,createdAt,publishedAt,unpublishedAt) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(articleId, author.actorId, author.userId, null, 'title', status, 1_000, null, null);
  fixture.sqlite.prepare('INSERT INTO article_bodies(articleId,privateHtml,publicHtml,updatedAt) VALUES (?,?,?,?)')
    .run(articleId, '<p>private</p>', '<p>public</p>', 1_000);
  fixture.sqlite.prepare(
    'INSERT INTO digests(digestId,userId,digestDate,articleId,createdAt,pushSentAt) VALUES (?,?,?,?,?,?)',
  ).run(digestId, author.userId, '2026-11-05', articleId, 2_000, null);
  fixture.sqlite.prepare(
    'INSERT INTO digest_items(digestItemId,digestId,feedEntryId,url,title,rank,score,summary,reasonInterestSourceId,feedback) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run('item-1', digestId, 'entry-1', 'https://example.com/a', 'A', 1, null, null, null, null);
  fixture.sqlite.prepare('INSERT INTO digest_trends(digestId,kind,rank,url,title,count) VALUES (?,?,?,?,?,?)')
    .run(digestId, 'hatena', 1, 'https://example.com/t', 'T', 3);
  fixture.sqlite.prepare('INSERT INTO digest_x_posts(digestId,rank,feedEntryId) VALUES (?,?,?)').run(
    digestId,
    1,
    'x-1',
  );
  fixture.sqlite.prepare(
    'INSERT INTO digest_deep_dives(deepDiveId,userId,digestItemId,articleId,createdAt,updatedAt) VALUES (?,?,?,?,?,?)',
  ).run('dive-1', author.userId, 'item-1', articleId, 3_000, 3_000);
  fixture.sqlite.prepare(
    'INSERT INTO digest_deep_dive_turns(turnId,deepDiveId,turnNumber,instruction,resultMarkdown,createdAt) VALUES (?,?,?,?,?,?)',
  ).run('turn-1', 'dive-1', 1, '', '- A', 3_000);
  const count = (table: string) =>
    Number((fixture.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number | bigint }).n);
  const eventNames = () =>
    (fixture.sqlite.prepare('SELECT eventName FROM domain_events ORDER BY rowid').all() as Array<{ eventName: string }>)
      .map((row) => row.eventName);
  const store = () =>
    createD1DraftArticleWithDependentsDeletedStore(fixture.db).store(
      Article.deleteArticle(now)(articleId),
      ArticleBody.deleteArticleBody(now)(articleId),
      Digest.expire({ digestId, digestDate: '2026-11-05' }, now),
    );
  return { fixture, articleId, count, eventNames, store };
};

describe('createD1DraftArticleWithDependentsDeletedStore', () => {
  it('draft なら、digest、items、trends、本文、article を消してイベントを書き、deleted を true にする', async () => {
    const { count, eventNames, store } = setup('draft');

    const result = await store();

    expect(result).toEqual({ ok: true, val: { deleted: true } });
    expect(count('digest_trends')).toBe(0);
    expect(count('digest_x_posts')).toBe(0);
    expect(count('digest_items')).toBe(0);
    expect(count('digest_deep_dives')).toBe(0);
    expect(count('digest_deep_dive_turns')).toBe(0);
    expect(count('digests')).toBe(0);
    expect(count('article_bodies')).toBe(0);
    expect(count('articles')).toBe(0);
    expect(eventNames()).toEqual(['digest.expired', 'articleBody.deleted', 'article.deleted']);
  });

  it.each(['published', 'unpublished'])(
    '%s なら、何も消さず、イベントも書かず、deleted を false にする',
    async (status) => {
      const { count, eventNames, store } = setup(status);

      const result = await store();

      expect(result).toEqual({ ok: true, val: { deleted: false } });
      expect(count('digest_trends')).toBe(1);
      expect(count('digest_x_posts')).toBe(1);
      expect(count('digest_items')).toBe(1);
      expect(count('digest_deep_dives')).toBe(1);
      expect(count('digest_deep_dive_turns')).toBe(1);
      expect(count('digests')).toBe(1);
      expect(count('article_bodies')).toBe(1);
      expect(count('articles')).toBe(1);
      expect(eventNames()).toEqual([]);
    },
  );

  it('確認の後に本文が編集された draft は、何も消さず、イベントも書かず、deleted を false にする', async () => {
    const { fixture, count, eventNames, store } = setup('draft');
    fixture.sqlite.prepare('UPDATE article_bodies SET updatedAt = 5_000').run();

    const result = await store();

    expect(result).toEqual({ ok: true, val: { deleted: false } });
    expect(count('digest_trends')).toBe(1);
    expect(count('digest_x_posts')).toBe(1);
    expect(count('digest_items')).toBe(1);
    expect(count('digest_deep_dives')).toBe(1);
    expect(count('digest_deep_dive_turns')).toBe(1);
    expect(count('digests')).toBe(1);
    expect(count('article_bodies')).toBe(1);
    expect(count('articles')).toBe(1);
    expect(eventNames()).toEqual([]);
  });

  it('本文のない draft は、本文のイベントを書かずに消す', async () => {
    const { fixture, articleId, count, eventNames } = setup('draft');
    fixture.sqlite.prepare('DELETE FROM article_bodies').run();
    const digestId = (fixture.sqlite.prepare('SELECT digestId FROM digests').get() as { digestId: string }).digestId;

    await createD1DraftArticleWithDependentsDeletedStore(fixture.db).store(
      Article.deleteArticle(now)(articleId),
      undefined,
      Digest.expire({ digestId: digestId as DigestId, digestDate: '2026-11-05' }, now),
    );

    expect(count('articles')).toBe(0);
    expect(eventNames()).toEqual(['digest.expired', 'article.deleted']);
  });

  it('batch の途中で失敗したら、消した行も戻る', async () => {
    const { fixture, count, store } = setup('draft');
    fixture.sqlite.exec('DROP TABLE domain_events');

    await expect(store()).rejects.toThrow();

    expect(count('digests')).toBe(1);
    expect(count('digest_items')).toBe(1);
    expect(count('digest_trends')).toBe(1);
    expect(count('digest_x_posts')).toBe(1);
    expect(count('article_bodies')).toBe(1);
    expect(count('articles')).toBe(1);
  });
});
