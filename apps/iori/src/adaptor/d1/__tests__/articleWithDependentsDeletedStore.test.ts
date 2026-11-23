import { describe, expect, it } from 'vitest';

import { Article } from '../../../domain/article/article.ts';
import { ArticleId } from '../../../domain/article/articleId.ts';
import { ArticleBody } from '../../../domain/articleBody/articleBody.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { createD1ArticleWithDependentsDeletedStore } from '../article/articleWithDependentsDeletedStore.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const now = Instant.orThrow(Date.parse('2026-11-05T00:00:00.000Z'));

const setup = () => {
  const fixture = createSqliteD1Fixture();
  const author = createMastodonSeed(fixture).addLocalActor('kosui');
  const articleId = ArticleId.generate();
  fixture.sqlite.prepare(
    'INSERT INTO articles(articleId,authorActorId,authorUserId,rootPostId,title,status,createdAt,publishedAt,unpublishedAt) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(articleId, author.actorId, author.userId, null, 'title', 'draft', 1_000, null, null);
  const addBody = () =>
    fixture.sqlite.prepare('INSERT INTO article_bodies(articleId,privateHtml,publicHtml,updatedAt) VALUES (?,?,?,?)')
      .run(articleId, '<p>private</p>', '<p>public</p>', 1_000);
  const addDeepDive = () => {
    fixture.sqlite.prepare(
      'INSERT INTO digest_deep_dives(deepDiveId,userId,digestItemId,articleId,createdAt,updatedAt) VALUES (?,?,?,?,?,?)',
    ).run('dive-1', author.userId, 'item-1', articleId, 3_000, 3_000);
    fixture.sqlite.prepare(
      'INSERT INTO digest_deep_dive_turns(turnId,deepDiveId,turnNumber,instruction,resultMarkdown,createdAt) VALUES (?,?,?,?,?,?)',
    ).run('turn-1', 'dive-1', 1, '', '- A', 3_000);
  };
  const count = (table: string) =>
    Number((fixture.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number | bigint }).n);
  const eventNames = () =>
    (fixture.sqlite.prepare('SELECT eventName FROM domain_events ORDER BY rowid').all() as Array<{ eventName: string }>)
      .map((row) => row.eventName);
  return { fixture, articleId, addBody, addDeepDive, count, eventNames };
};

describe('createD1ArticleWithDependentsDeletedStore', () => {
  it('article は、深掘り、本文、article を消してイベントを書き、digest の行は触らない', async () => {
    const { fixture, articleId, addBody, addDeepDive, count, eventNames } = setup();
    addBody();
    addDeepDive();
    fixture.sqlite.prepare(
      'INSERT INTO digests(digestId,userId,digestDate,articleId,createdAt) VALUES (?,(SELECT userId FROM users),?,?,?)',
    ).run('digest-1', '2026-11-05', articleId, 2_000);

    await createD1ArticleWithDependentsDeletedStore(fixture.db).store(
      Article.deleteArticle(now)(articleId),
      ArticleBody.deleteArticleBody(now)(articleId),
    );

    expect(count('digest_deep_dives')).toBe(0);
    expect(count('digest_deep_dive_turns')).toBe(0);
    expect(count('article_bodies')).toBe(0);
    expect(count('articles')).toBe(0);
    expect(count('digests')).toBe(1);
    expect(eventNames()).toEqual(['articleBody.deleted', 'article.deleted']);
  });

  it('batch の途中で失敗したら、消した行も戻る', async () => {
    const { fixture, articleId, addBody, addDeepDive, count } = setup();
    addBody();
    addDeepDive();
    fixture.sqlite.exec('DROP TABLE domain_events');

    await expect(
      createD1ArticleWithDependentsDeletedStore(fixture.db).store(
        Article.deleteArticle(now)(articleId),
        ArticleBody.deleteArticleBody(now)(articleId),
      ),
    ).rejects.toThrow();

    expect(count('digest_deep_dives')).toBe(1);
    expect(count('article_bodies')).toBe(1);
    expect(count('articles')).toBe(1);
  });
});
