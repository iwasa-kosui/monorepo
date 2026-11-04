import { describe, expect, it } from 'vitest';

import { Article } from '../../../domain/article/article.ts';
import { ArticleBody } from '../../../domain/articleBody/articleBody.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { createD1ArticleWithBodyEditedStore } from '../article/articleWithBodyEditedStore.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const createdAt = Instant.orThrow(1_000);
const now = Instant.orThrow(5_000);

const setup = (status: string) => {
  const fixture = createSqliteD1Fixture();
  const author = createMastodonSeed(fixture).addLocalActor('kosui');
  const created = Article.createArticle(createdAt)({
    authorActorId: author.actorId as never,
    authorUserId: author.userId as never,
    rootPostId: null,
    title: 'Before',
  }).aggregateState;
  fixture.sqlite.prepare(
    'INSERT INTO articles(articleId,authorActorId,authorUserId,rootPostId,title,status,createdAt,publishedAt,unpublishedAt) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(created.articleId, author.actorId, author.userId, null, 'Before', status, createdAt, null, null);
  fixture.sqlite.prepare('INSERT INTO article_bodies(articleId,privateHtml,publicHtml,updatedAt) VALUES (?,?,?,?)')
    .run(created.articleId, '<p>old private</p>', '<p>old public</p>', createdAt);
  const edit = (title: string | undefined, baseUpdatedAt: Instant = createdAt) =>
    createD1ArticleWithBodyEditedStore(fixture.db).store(
      title === undefined ? undefined : Article.changeArticleTitle(now)(created, title).val as never,
      ArticleBody.writeArticleBody(now)({
        articleId: created.articleId,
        privateHtml: '<p>new</p>',
        publicHtml: '<p>new</p>',
        markdown: 'new',
      }),
      baseUpdatedAt,
    );
  const title = () => (fixture.sqlite.prepare('SELECT title FROM articles').get() as { title: string }).title;
  const body = () =>
    fixture.sqlite.prepare('SELECT privateHtml, publicHtml, markdown, updatedAt FROM article_bodies').get();
  const eventNames = () =>
    (fixture.sqlite.prepare('SELECT eventName FROM domain_events ORDER BY rowid').all() as Array<{ eventName: string }>)
      .map((row) => row.eventName);
  const overwriteBody = (updatedAt: number) =>
    fixture.sqlite.prepare('UPDATE article_bodies SET publicHtml = ?, updatedAt = ?').run('<p>other</p>', updatedAt);
  return { edit, title, body, eventNames, overwriteBody };
};

describe('createD1ArticleWithBodyEditedStore', () => {
  it.each(['draft', 'unpublished'])(
    '%s なら、タイトルと本文を更新してイベントを書き、edited を true にする',
    async (status) => {
      const { edit, title, body, eventNames } = setup(status);

      const result = await edit('After');

      expect(result).toEqual({ ok: true, val: { edited: true } });
      expect(title()).toBe('After');
      expect(body()).toEqual({ privateHtml: '<p>new</p>', publicHtml: '<p>new</p>', markdown: 'new', updatedAt: now });
      expect(eventNames()).toEqual(['articleBody.written', 'article.titleChanged']);
    },
  );

  it('タイトルが変わらなければ、タイトルを更新せず article.titleChanged も書かない', async () => {
    const { edit, title, body, eventNames } = setup('draft');

    const result = await edit(undefined);

    expect(result).toEqual({ ok: true, val: { edited: true } });
    expect(title()).toBe('Before');
    expect(body()).toMatchObject({ publicHtml: '<p>new</p>', markdown: 'new' });
    expect(eventNames()).toEqual(['articleBody.written']);
  });

  it('確認の後、書き込みの前に published になっていたら、何も変えず edited を false にする', async () => {
    const { edit, title, body, eventNames } = setup('published');

    const result = await edit('After');

    expect(result).toEqual({ ok: true, val: { edited: false } });
    expect(title()).toBe('Before');
    expect(body()).toEqual({
      privateHtml: '<p>old private</p>',
      publicHtml: '<p>old public</p>',
      markdown: null,
      updatedAt: createdAt,
    });
    expect(eventNames()).toEqual([]);
  });

  it.each(['draft', 'unpublished'])(
    '%s でも、版が編集の開始時と違えば（間に別の保存があれば）何も変えず edited を false にする',
    async (status) => {
      const { edit, title, body, eventNames, overwriteBody } = setup(status);
      overwriteBody(3_000);

      const result = await edit('After');

      expect(result).toEqual({ ok: true, val: { edited: false } });
      expect(title()).toBe('Before');
      expect(body()).toMatchObject({ publicHtml: '<p>other</p>', updatedAt: 3_000 });
      expect(eventNames()).toEqual([]);
    },
  );

  it('版が一致すれば、本文の updatedAt を書き込んだ版にする', async () => {
    const { edit, body, overwriteBody } = setup('draft');
    overwriteBody(3_000);

    const result = await edit(undefined, Instant.orThrow(3_000));

    expect(result).toEqual({ ok: true, val: { edited: true } });
    expect(body()).toMatchObject({ publicHtml: '<p>new</p>', updatedAt: now });
  });
});
