import { RA } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { createIoriApp } from '../../../appFactory.tsx';
import { buildDigestBodies } from '../../../domain/digest/digestBody.ts';
import { renderMarkdownToUnsanitizedHtml } from '../../../domain/post/postContent.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createMockRequestContext } from '../../../useCase/__tests__/helper/mockAdaptors.ts';
import { EditArticleUseCase } from '../../../useCase/editArticle.ts';
import { GetArticleForEditUseCase } from '../../../useCase/getArticleForEdit.ts';
import { createMastodonSeed } from '../../d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../d1/__tests__/sqliteFixture.ts';
import { createD1ArticleResolver } from '../../d1/article/articleResolver.ts';
import { createD1ArticleWithBodyEditedStore } from '../../d1/article/articleWithBodyEditedStore.ts';
import { createD1ArticleBodyResolver } from '../../d1/articleBody/articleBodyResolver.ts';
import { htmlToMarkdown } from '../../text/htmlToMarkdown.ts';
import { createMastodonAuthn } from '../mastodonAuthn.ts';
import { createWorkerIoriArticlesRouter } from '../workerIoriArticlesRouter.ts';
import { createOAuthHarness } from './helper/oauthHarness.ts';

const origin = 'https://worker.test';
const articlesPath = `${origin}/api/iori/v1/articles`;
const sameOrigin = { Origin: origin };
const otherOrigin = { Origin: 'https://evil.example' };
const json = { 'Content-Type': 'application/json' };
const unused = { run: async () => RA.err({}) } as never;
const CREATED_AT = 1_000;

const digestBody = buildDigestBodies({
  radar: undefined,
  recommendations: [
    { title: 'First', url: 'https://example.com/first', summary: '要約', fromHatena: false, reason: null },
  ],
  timelineTrends: [],
  hatenaTrends: [],
});

const setup = () => {
  const harness = createOAuthHarness();
  const authn = createMastodonAuthn({
    verifyAccessTokenUseCase: harness.memory.useCases.verifyAccessTokenUseCase,
    sessionResolver: harness.memory.sessionResolver as never,
  });
  const fixture = createSqliteD1Fixture();
  const { sqlite, db } = fixture;
  const seed = createMastodonSeed(fixture);

  const addAuthor = (username: string, userId: string = UserId.generate()) => seed.addLocalActor(username, userId);
  const addArticle = (
    author: { actorId: string; userId: string },
    options: {
      status?: string;
      rootPostId?: string | null;
      markdown?: string | null;
      publicHtml?: string;
      privateHtml?: string;
    } = {},
  ) => {
    const articleId = seed.uuid();
    sqlite.prepare(
      'INSERT INTO articles(articleId,authorActorId,authorUserId,rootPostId,title,status,createdAt,publishedAt,unpublishedAt) VALUES (?,?,?,?,?,?,?,?,?)',
    ).run(
      articleId,
      author.actorId,
      author.userId,
      options.rootPostId ?? null,
      'Original title',
      options.status ?? 'draft',
      CREATED_AT,
      null,
      null,
    );
    if (options.rootPostId === undefined || options.rootPostId === null) {
      sqlite.prepare(
        'INSERT INTO article_bodies(articleId,privateHtml,publicHtml,markdown,updatedAt) VALUES (?,?,?,?,?)',
      ).run(
        articleId,
        options.privateHtml ?? digestBody.privateHtml,
        options.publicHtml ?? digestBody.publicHtml,
        options.markdown ?? null,
        CREATED_AT,
      );
    }
    return articleId;
  };

  const app = createIoriApp({
    federationMiddleware: undefined,
    registerRoutes: (router) => {
      router.route(
        '/api',
        createWorkerIoriArticlesRouter({
          getArticleWithThreadUseCase: unused,
          getArticlesUseCase: unused,
          createArticleUseCase: unused,
          publishArticleUseCase: unused,
          unpublishArticleUseCase: unused,
          deleteArticleUseCase: unused,
          getArticleForEditUseCase: GetArticleForEditUseCase.create({
            articleResolver: createD1ArticleResolver(db),
            articleBodyResolver: createD1ArticleBodyResolver(db),
            htmlToMarkdown,
          }),
          editArticleUseCase: EditArticleUseCase.create({
            articleResolver: createD1ArticleResolver(db),
            articleWithBodyEditedStore: createD1ArticleWithBodyEditedStore(db),
            renderMarkdown: renderMarkdownToUnsanitizedHtml,
          }),
          publishedArticlesResolver: { resolve: async () => RA.ok({ articles: [], authorUsername: null }) },
          createContext: () => createMockRequestContext(),
          authn,
        }),
      );
    },
    serveAsset: async () => undefined,
    serveUpload: async () => undefined,
    serveOgImage: async () => new Response('not implemented', { status: 501 }),
  });

  const cookieFor = (userId: string) => `sessionId=${harness.memory.addSession(userId as UserId).sessionId}`;
  const bearerFor = async (scope: string) => {
    const issued = await harness.issueUserToken(scope);
    return { userId: issued.userId, headers: { Authorization: `Bearer ${issued.token}` } };
  };
  const put = (articleId: string, headers: Record<string, string>, body: unknown) =>
    app.request(`${articlesPath}/${articleId}`, {
      method: 'PUT',
      headers: { ...json, ...headers },
      body: JSON.stringify(body),
    });
  const getEdit = (articleId: string, headers: Record<string, string>) =>
    app.request(`${articlesPath}/${articleId}/edit`, { headers });
  const row = (query: string) => sqlite.prepare(query).all();

  return { sqlite, addAuthor, addArticle, cookieFor, bearerFor, put, getEdit, row };
};

const valid = {
  title: '新しいタイトル',
  markdown: '## 見出し\n\n本文 [link](https://example.com/a)',
  baseUpdatedAt: CREATED_AT,
};

describe('PUT /api/iori/v1/articles/:articleId', () => {
  it('著者の Cookie と同じ Origin で 200 を返し、タイトルと本文を更新して domain event を残す', async () => {
    const t = setup();
    const author = t.addAuthor('alice');
    const articleId = t.addArticle(author);

    const response = await t.put(articleId, { Cookie: t.cookieFor(author.userId), ...sameOrigin }, valid);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      article: { articleId, title: '新しいタイトル', status: 'draft' },
    });
    expect(t.row('SELECT title FROM articles')).toEqual([{ title: '新しいタイトル' }]);
    const [body] = t.row('SELECT privateHtml, publicHtml, markdown, updatedAt FROM article_bodies') as Array<
      { privateHtml: string; publicHtml: string; markdown: string; updatedAt: number }
    >;
    expect(body!.privateHtml).toBe(body!.publicHtml);
    expect(body!.publicHtml).toContain('<h2>見出し</h2>');
    expect(body!.publicHtml).toContain('href="https://example.com/a"');
    expect(body!.markdown).toBe(valid.markdown);
    expect(body!.updatedAt).toBeGreaterThan(CREATED_AT);
    expect(
      t.row(
        'SELECT eventName, aggregateName FROM domain_events WHERE eventName IN (\'article.titleChanged\', \'articleBody.written\') ORDER BY eventName',
      ),
    ).toEqual([
      { eventName: 'article.titleChanged', aggregateName: 'article' },
      { eventName: 'articleBody.written', aggregateName: 'articleBody' },
    ]);
  });

  it('タイトルが今と同じなら、article.titleChanged を書かずに本文だけ更新する', async () => {
    const t = setup();
    const author = t.addAuthor('alice');
    const articleId = t.addArticle(author);

    const response = await t.put(articleId, { Cookie: t.cookieFor(author.userId), ...sameOrigin }, {
      title: 'Original title',
      markdown: valid.markdown,
      baseUpdatedAt: CREATED_AT,
    });

    expect(response.status).toBe(200);
    expect(t.row('SELECT eventName FROM domain_events ORDER BY eventName')).toEqual([
      { eventName: 'articleBody.written' },
    ]);
    expect(t.row('SELECT markdown FROM article_bodies')).toEqual([{ markdown: valid.markdown }]);
  });

  it('保存する HTML からスクリプトを除く', async () => {
    const t = setup();
    const author = t.addAuthor('alice');
    const articleId = t.addArticle(author);

    const response = await t.put(articleId, { Cookie: t.cookieFor(author.userId), ...sameOrigin }, {
      title: 'タイトル',
      markdown: '本文<script>alert(1)</script>',
      baseUpdatedAt: CREATED_AT,
    });

    expect(response.status).toBe(200);
    const [body] = t.row('SELECT publicHtml FROM article_bodies') as Array<{ publicHtml: string }>;
    expect(body!.publicHtml).not.toContain('script');
  });

  it('h4 以下の見出し、水平線、GFM の表を保存した HTML に残す', async () => {
    const t = setup();
    const author = t.addAuthor('alice');
    const articleId = t.addArticle(author);

    const response = await t.put(articleId, { Cookie: t.cookieFor(author.userId), ...sameOrigin }, {
      title: 'タイトル',
      markdown: '#### 小見出し\n\n---\n\n| a | b |\n| - | - |\n| 1 | 2 |',
      baseUpdatedAt: CREATED_AT,
    });

    expect(response.status).toBe(200);
    const [body] = t.row('SELECT publicHtml FROM article_bodies') as Array<{ publicHtml: string }>;
    expect(body!.publicHtml).toContain('<h4>小見出し</h4>');
    expect(body!.publicHtml).toContain('<hr />');
    expect(body!.publicHtml).toContain('<table>');
    expect(body!.publicHtml).toContain('<td>1</td>');
  });

  it('unpublished の記事も更新できる', async () => {
    const t = setup();
    const author = t.addAuthor('alice');
    const articleId = t.addArticle(author, { status: 'unpublished' });

    const response = await t.put(articleId, { Cookie: t.cookieFor(author.userId), ...sameOrigin }, valid);

    expect(response.status).toBe(200);
  });

  it('Bearer の著者は Origin なしで 200 を返す', async () => {
    const t = setup();
    const me = await t.bearerFor('write:statuses');
    const author = t.addAuthor('alice', me.userId);
    const articleId = t.addArticle(author);

    const response = await t.put(articleId, me.headers, valid);

    expect(response.status).toBe(200);
    expect(t.row('SELECT title FROM articles')).toEqual([{ title: '新しいタイトル' }]);
  });

  it('write:statuses を満たさない scope の Bearer は 403 にして更新しない', async () => {
    const t = setup();
    const me = await t.bearerFor('read:statuses');
    const author = t.addAuthor('alice', me.userId);
    const articleId = t.addArticle(author);

    const response = await t.put(articleId, me.headers, valid);

    expect(response.status).toBe(403);
    expect(t.row('SELECT title FROM articles')).toEqual([{ title: 'Original title' }]);
  });

  it.each([
    ['Origin がない', {}],
    ['別の Origin', otherOrigin],
  ])('Cookie で %s ときは 403 にして更新しない', async (_name, headers) => {
    const t = setup();
    const author = t.addAuthor('alice');
    const articleId = t.addArticle(author);

    const response = await t.put(articleId, { Cookie: t.cookieFor(author.userId), ...headers }, valid);

    expect(response.status).toBe(403);
    expect(t.row('SELECT title FROM articles')).toEqual([{ title: 'Original title' }]);
    expect(t.row('SELECT count(*) AS n FROM domain_events WHERE eventName = \'article.titleChanged\'')).toEqual([
      { n: 0 },
    ]);
  });

  it('認証がなければ 401 を返す', async () => {
    const t = setup();
    const author = t.addAuthor('alice');
    const articleId = t.addArticle(author);

    const response = await t.put(articleId, sameOrigin, valid);

    expect(response.status).toBe(401);
  });

  it('他の人の記事と存在しない記事は 404 にして更新しない', async () => {
    const t = setup();
    const author = t.addAuthor('alice');
    const other = t.addAuthor('bob');
    const articleId = t.addArticle(author);
    const headers = { Cookie: t.cookieFor(other.userId), ...sameOrigin };

    const notAuthor = await t.put(articleId, headers, valid);
    const missing = await t.put('00000000-0000-4000-8000-0000000000ff', headers, valid);

    expect(notAuthor.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(t.row('SELECT title FROM articles')).toEqual([{ title: 'Original title' }]);
  });

  it('published の記事は 409 にして更新しない', async () => {
    const t = setup();
    const author = t.addAuthor('alice');
    const articleId = t.addArticle(author, { status: 'published' });

    const response = await t.put(articleId, { Cookie: t.cookieFor(author.userId), ...sameOrigin }, valid);

    expect(response.status).toBe(409);
    expect(t.row('SELECT title FROM articles')).toEqual([{ title: 'Original title' }]);
  });

  it('baseUpdatedAt が今の本文の版と違えば 409 にして、本文もタイトルも更新しない', async () => {
    const t = setup();
    const author = t.addAuthor('alice');
    const articleId = t.addArticle(author);

    const response = await t.put(articleId, { Cookie: t.cookieFor(author.userId), ...sameOrigin }, {
      ...valid,
      baseUpdatedAt: CREATED_AT - 1,
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: '本文が更新されています。読み込み直してください' });
    expect(t.row('SELECT title FROM articles')).toEqual([{ title: 'Original title' }]);
    expect(t.row('SELECT markdown, updatedAt FROM article_bodies')).toEqual([
      { markdown: null, updatedAt: CREATED_AT },
    ]);
    expect(t.row('SELECT count(*) AS n FROM domain_events')).toEqual([{ n: 0 }]);
  });

  it('同じ版から続けて保存すると、2 回目は 409 にして 1 回目の本文を残す', async () => {
    const t = setup();
    const author = t.addAuthor('alice');
    const articleId = t.addArticle(author);
    const headers = { Cookie: t.cookieFor(author.userId), ...sameOrigin };

    const first = await t.put(articleId, headers, valid);
    const second = await t.put(articleId, headers, { ...valid, title: '別のタイトル', markdown: '上書き' });

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(t.row('SELECT title FROM articles')).toEqual([{ title: '新しいタイトル' }]);
    expect(t.row('SELECT markdown FROM article_bodies')).toEqual([{ markdown: valid.markdown }]);
  });

  it('rootPostId を持つ記事は 409 にする', async () => {
    const t = setup();
    const author = t.addAuthor('alice');
    const post = seedPost(t, author);
    const articleId = t.addArticle(author, { rootPostId: post });

    const response = await t.put(articleId, { Cookie: t.cookieFor(author.userId), ...sameOrigin }, valid);

    expect(response.status).toBe(409);
  });

  it.each([
    ['タイトルが空', { title: '', markdown: 'a', baseUpdatedAt: CREATED_AT }],
    ['タイトルが 201 文字', { title: 'a'.repeat(201), markdown: 'a', baseUpdatedAt: CREATED_AT }],
    ['タイトルが文字列でない', { title: 1, markdown: 'a', baseUpdatedAt: CREATED_AT }],
    ['タイトルがない', { markdown: 'a', baseUpdatedAt: CREATED_AT }],
    ['本文が空', { title: 'a', markdown: '', baseUpdatedAt: CREATED_AT }],
    ['本文がない', { title: 'a', baseUpdatedAt: CREATED_AT }],
    ['本文が長すぎる', { title: 'a', markdown: 'a'.repeat(100_001), baseUpdatedAt: CREATED_AT }],
    ['baseUpdatedAt がない', { title: 'a', markdown: 'a' }],
    ['baseUpdatedAt が整数でない', { title: 'a', markdown: 'a', baseUpdatedAt: 'x' }],
    ['baseUpdatedAt が負', { title: 'a', markdown: 'a', baseUpdatedAt: -1 }],
  ])('%s ときは 400 にして更新しない', async (_name, body) => {
    const t = setup();
    const author = t.addAuthor('alice');
    const articleId = t.addArticle(author);

    const response = await t.put(articleId, { Cookie: t.cookieFor(author.userId), ...sameOrigin }, body);

    expect(response.status).toBe(400);
    expect(t.row('SELECT title FROM articles')).toEqual([{ title: 'Original title' }]);
    expect(t.row('SELECT markdown FROM article_bodies')).toEqual([{ markdown: null }]);
  });

  it('記事 ID が UUID でなければ 400 にする', async () => {
    const t = setup();
    const author = t.addAuthor('alice');

    const response = await t.put('not-a-uuid', { Cookie: t.cookieFor(author.userId), ...sameOrigin }, valid);

    expect(response.status).toBe(400);
  });
});

describe('GET /api/iori/v1/articles/:articleId/edit', () => {
  it('markdown 列があればそれを返す', async () => {
    const t = setup();
    const author = t.addAuthor('alice');
    const articleId = t.addArticle(author, { markdown: '# 保存した Markdown' });

    const response = await t.getEdit(articleId, { Cookie: t.cookieFor(author.userId) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      title: 'Original title',
      markdown: '# 保存した Markdown',
      updatedAt: CREATED_AT,
    });
  });

  it('markdown 列が NULL なら publicHtml を Markdown に変換して返す', async () => {
    const t = setup();
    const author = t.addAuthor('alice');
    const articleId = t.addArticle(author, {
      privateHtml: '<h2>private</h2>',
      publicHtml:
        '<h2>新着</h2><ul><li><a href="https://example.com/x">X</a>（はてなブックマーク 3）<br>要約</li></ul>',
    });

    const response = await t.getEdit(articleId, { Cookie: t.cookieFor(author.userId) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      title: 'Original title',
      markdown: '## 新着\n\n-   [X](https://example.com/x)（はてなブックマーク 3）  \n    要約',
      updatedAt: CREATED_AT,
    });
  });

  it('保存してから開き直すと、保存した Markdown を返す', async () => {
    const t = setup();
    const author = t.addAuthor('alice');
    const articleId = t.addArticle(author);
    const headers = { Cookie: t.cookieFor(author.userId), ...sameOrigin };

    await t.put(articleId, headers, valid);
    const response = await t.getEdit(articleId, headers);

    await expect(response.json()).resolves.toEqual({
      title: valid.title,
      markdown: valid.markdown,
      updatedAt: expect.any(Number),
    });
  });

  it('table を含む publicHtml を開いて、そのまま保存しても table が残る', async () => {
    const t = setup();
    const author = t.addAuthor('alice');
    const articleId = t.addArticle(author, {
      publicHtml: '<h2>表</h2><table><thead><tr><th>a</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>',
    });
    const headers = { Cookie: t.cookieFor(author.userId), ...sameOrigin };

    const opened = await (await t.getEdit(articleId, headers)).json() as {
      title: string;
      markdown: string;
      updatedAt: number;
    };
    const response = await t.put(articleId, headers, {
      title: opened.title,
      markdown: opened.markdown,
      baseUpdatedAt: opened.updatedAt,
    });

    expect(response.status).toBe(200);
    const [body] = t.row('SELECT publicHtml FROM article_bodies') as Array<{ publicHtml: string }>;
    expect(body!.publicHtml).toContain('<h2>表</h2>');
    expect(body!.publicHtml).toContain('<table>');
    expect(body!.publicHtml).toContain('<td>1</td>');
  });

  it('他の人の記事は 404、published は 409、認証がなければ 401 にする', async () => {
    const t = setup();
    const author = t.addAuthor('alice');
    const other = t.addAuthor('bob');
    const draft = t.addArticle(author);
    const published = t.addArticle(author, { status: 'published' });

    expect((await t.getEdit(draft, { Cookie: t.cookieFor(other.userId) })).status).toBe(404);
    expect((await t.getEdit(published, { Cookie: t.cookieFor(author.userId) })).status).toBe(409);
    expect((await t.getEdit(draft, {})).status).toBe(401);
  });
});

function seedPost(t: ReturnType<typeof setup>, author: { actorId: string; userId: string }): string {
  const postId = '00000000-0000-4000-8000-0000000000aa';
  t.sqlite.prepare('INSERT INTO posts(postId,actorId,content,createdAt,type) VALUES (?,?,?,?,?)').run(
    postId,
    author.actorId,
    'root',
    500,
    'local',
  );
  return postId;
}
