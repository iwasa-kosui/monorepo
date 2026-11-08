import type { ExecutionContext } from '@cloudflare/workers-types';
import { afterEach, describe, expect, it } from 'vitest';

import { createSqliteD1Fixture } from './adaptor/d1/__tests__/sqliteFixture.ts';
import { EMBEDDING_DIMENSIONS } from './domain/interestSource/embedding.ts';
import { float32ToBytes } from './domain/interestSource/embeddingBytes.ts';
import { UserId } from './domain/user/userId.ts';
import { createDigestUseCases } from './scheduled/digestTasks.ts';
import { admissionFixture } from './testing/admissionFixture.ts';
import worker from './worker.ts';
import type { IoriWorkerEnv } from './workerEnv.ts';

const origin = 'https://worker.test';
const userId = crypto.randomUUID();
const actorId = crypto.randomUUID();
const sessionId = crypto.randomUUID();
const executionContext = {} as ExecutionContext;
const HOUR = 60 * 60 * 1000;

const POST_TEXT = 'secret-x-post-text';
const USERNAME = 'secret_x_user';
const POST_URL = `https://x.com/${USERNAME}/status/1234567890`;
const SECOND_TEXT = 'second-x-post-text';
const SECOND_URL = `https://x.com/${USERNAME}/status/1234567891`;
const secrets = [POST_TEXT, SECOND_TEXT, USERNAME, POST_URL, SECOND_URL, 'x.com'];

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const basis0 = float32ToBytes(Float32Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? 1 : 0)));

const setup = async () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const { sqlite } = fixture;
  sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(userId, 'kosui');
  sqlite.prepare('INSERT INTO actors(actorId,uri,inboxUrl,type) VALUES (?,?,?,?)').run(
    actorId,
    `${origin}/users/kosui`,
    `${origin}/users/kosui/inbox`,
    'local',
  );
  sqlite.prepare('INSERT INTO local_actors(actorId,userId) VALUES (?,?)').run(actorId, userId);
  sqlite.prepare('INSERT INTO sessions(sessionId,userId,expires) VALUES (?,?,?)').run(
    sessionId,
    userId,
    Date.now() + 60_000,
  );
  sqlite.prepare(
    'INSERT INTO digest_topics(userId,topicKey,name,description,embedding,embeddedAt,sortOrder,enabled,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(userId, 'genai', '生成 AI とエージェント', 'topic', basis0, 1, 0, 1, 1, 1);
  const addSource = (kind: string, url: string) => {
    const feedSourceId = crypto.randomUUID();
    sqlite.prepare('INSERT INTO feed_sources(feedSourceId,kind,url,title,enabled,createdAt) VALUES (?,?,?,?,?,?)')
      .run(feedSourceId, kind, url, kind, 1, 1);
    return feedSourceId;
  };
  const addEntry = (feedSourceId: string, title: string, url: string) =>
    sqlite.prepare(
      'INSERT INTO feed_entries(feedEntryId,feedSourceId,guid,url,title,description,publishedAt,hatenaBookmarkCount,fetchedAt,embedding,embeddedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    ).run(
      crypto.randomUUID(),
      feedSourceId,
      `guid-${title}`,
      url,
      title,
      title,
      null,
      null,
      Date.now() - HOUR,
      basis0,
      Date.now(),
    );
  const rss = addSource('rss', 'https://feeds.example/rss');
  for (const n of [1, 2, 3]) addEntry(rss, `News ${n}`, `https://news.example/${n}`);
  const xSource = addSource('x_user', `https://x.com/${USERNAME}`);
  addEntry(xSource, POST_TEXT, POST_URL);
  addEntry(xSource, SECOND_TEXT, SECOND_URL);
  const env = {
    DB: fixture.binding,
    UPLOADS: { get: async () => null, put: async () => undefined, head: async () => null },
    FEDIFY_KV: { get: async () => null },
    FEDIFY_QUEUE: { send: async () => undefined, sendBatch: async () => undefined },
    ASSETS: { fetch: async () => new Response('Not Found', { status: 404 }) },
    ...admissionFixture(),
    VAPID_SUBJECT: 'mailto:admin@example.invalid',
    VAPID_PUBLIC_KEY: 'fixture-public',
    VAPID_PRIVATE_KEY: 'fixture-private',
  } as unknown as IoriWorkerEnv;
  const request = (path: string, init?: RequestInit) =>
    worker.fetch(new Request(`${origin}${path}`, { redirect: 'manual', ...init }), env, executionContext);

  const created = await createDigestUseCases(env).createDailyDigest.run({
    userId: UserId.orThrow(userId),
    trigger: 'requested',
  });
  if (!created.ok) throw new Error(`unexpected error: ${JSON.stringify(created.err)}`);
  const articleIdOf = (topicKey: string) =>
    (sqlite.prepare('SELECT articleId FROM digests WHERE topicKey = ?').get(topicKey) as { articleId: string })
      .articleId;
  const publishDirectly = (articleId: string) =>
    sqlite.prepare('UPDATE articles SET status = \'published\', publishedAt = 2000 WHERE articleId = ?')
      .run(articleId);
  const expireXPost = (text: string) => sqlite.prepare('DELETE FROM feed_entries WHERE title = ?').run(text);
  return {
    sqlite,
    expireXPost,
    xSource,
    request,
    result: created.val,
    summaryId: articleIdOf('summary'),
    topicId: articleIdOf('genai'),
    publishDirectly,
  };
};

const cookie = { Cookie: `sessionId=${sessionId}` };
const activity = { Accept: 'application/activity+json' };

describe('X の投稿を取り込んだ日のダイジェスト', () => {
  const summaryOf = async (
    request: Awaited<ReturnType<typeof setup>>['request'],
    summaryId: string,
    headers = cookie,
  ) => {
    const response = await request(`/api/iori/v1/articles/${summaryId}`, { headers });
    return {
      response,
      body: await response.json() as { body?: { html: string }; digest?: { excluded: { xPosts: boolean } } },
    };
  };

  it('作者がまとめを開くと、保存した feedEntryId から引いた X の投稿が見え、公開の確認では X の投稿を除くと伝える', async () => {
    const { request, result, summaryId } = await setup();

    const { response, body } = await summaryOf(request, summaryId);

    expect(result).toMatchObject({ status: 'created', xPosts: 2 });
    expect(response.status).toBe(200);
    expect(body.body?.html).toContain('<h2>X の投稿</h2>');
    expect(body.body?.html).toContain(`@${USERNAME} <a href="${POST_URL}"`);
    expect(body.body?.html).toContain(POST_TEXT);
    expect(body.body?.html).toContain(SECOND_TEXT);
    expect(body.digest?.excluded.xPosts).toBe(true);
  });

  it('保存するのは feedEntryId だけで、記事の本文とエディタの読み込みには X の投稿が入らない', async () => {
    const { sqlite, request, summaryId } = await setup();

    const feedEntryIds = (sqlite.prepare('SELECT feedEntryId FROM digest_x_posts').all() as Array<
      { feedEntryId: string }
    >).map((row) => row.feedEntryId);
    const stored = JSON.stringify(sqlite.prepare('SELECT * FROM article_bodies').all());
    const edit = await request(`/api/iori/v1/articles/${summaryId}/edit`, { headers: cookie });
    const editText = await edit.text();

    expect(edit.status).toBe(200);
    for (const secret of [...secrets, ...feedEntryIds]) {
      expect(stored.includes(secret), secret).toBe(false);
      expect(editText.includes(secret), secret).toBe(false);
    }
    expect(sqlite.prepare('SELECT count(*) AS n FROM digest_x_posts').get()).toEqual({ n: 2 });
  });

  it('7 日を過ぎて feed_entries から消えた投稿は出さず、残った投稿だけを出す', async () => {
    const { request, summaryId, expireXPost } = await setup();
    expireXPost(POST_TEXT);

    const { body } = await summaryOf(request, summaryId);

    expect(body.body?.html).toContain('<h2>X の投稿</h2>');
    expect(body.body?.html).toContain(SECOND_TEXT);
    expect(body.body?.html).not.toContain(POST_TEXT);
  });

  it('全部消えていれば、「X の投稿」の節を出さない', async () => {
    const { request, summaryId, expireXPost } = await setup();
    expireXPost(POST_TEXT);
    expireXPost(SECOND_TEXT);

    const { response, body } = await summaryOf(request, summaryId);

    expect(response.status).toBe(200);
    expect(body.body?.html).not.toContain('X の投稿');
    for (const secret of secrets) expect(JSON.stringify(body).includes(secret), secret).toBe(false);
  });

  it('情報源を無効にした投稿は出さない', async () => {
    const { sqlite, request, summaryId, xSource } = await setup();
    sqlite.prepare('UPDATE feed_sources SET enabled = 0 WHERE feedSourceId = ?').run(xSource);

    const { body } = await summaryOf(request, summaryId);

    expect(body.body?.html).not.toContain('X の投稿');
  });

  it('作者以外のユーザーと匿名には、まとめも X の投稿も見せない', async () => {
    const { sqlite, request, summaryId } = await setup();
    const otherUserId = crypto.randomUUID();
    const otherSessionId = crypto.randomUUID();
    sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(otherUserId, 'other');
    sqlite.prepare('INSERT INTO sessions(sessionId,userId,expires) VALUES (?,?,?)').run(
      otherSessionId,
      otherUserId,
      Date.now() + 60_000,
    );

    const other = await summaryOf(request, summaryId, { Cookie: `sessionId=${otherSessionId}` });
    const anonymous = await summaryOf(request, summaryId, {} as typeof cookie);

    for (const { response, body } of [other, anonymous]) {
      expect(response.status).toBe(404);
      for (const secret of secrets) expect(JSON.stringify(body).includes(secret), secret).toBe(false);
    }
  });

  it('保存した feedEntryId が 0 件のまとめは、公開の確認で X の投稿を除くと伝えない', async () => {
    const { sqlite, request, summaryId } = await setup();
    sqlite.prepare('DELETE FROM digest_x_posts').run();

    const { body } = await summaryOf(request, summaryId);

    expect(body.digest?.excluded.xPosts).toBe(false);
    expect(body.body?.html).not.toContain('X の投稿');
  });

  it('まとめは公開できず、公開しようとしても X の投稿を外に出さない', async () => {
    const { request, summaryId } = await setup();

    const publish = await request(`/api/iori/v1/articles/${summaryId}/publish`, {
      method: 'POST',
      headers: { ...cookie, Origin: origin },
    });
    const anonymous = await request(`/api/iori/v1/articles/${summaryId}`);
    const object = await request(`/users/kosui/articles/${summaryId}`, { headers: activity });

    expect(publish.status).toBe(409);
    expect(anonymous.status).toBe(404);
    expect(object.status).toBe(404);
    for (const response of [publish, anonymous, object]) {
      const text = await response.text();
      for (const secret of secrets) expect(text).not.toContain(secret);
    }
  });

  it('まとめが公開の状態になってしまっても、公開ページの本文と ActivityPub の Article に X の投稿を出さない', async () => {
    const { request, summaryId, publishDirectly } = await setup();
    publishDirectly(summaryId);

    const page = await request(`/api/iori/v1/articles/${summaryId}`);
    const list = await request('/api/iori/v1/articles');
    const object = await request(`/users/kosui/articles/${summaryId}`, { headers: activity });

    expect(page.status).toBe(200);
    expect(object.status).toBe(200);
    expect(object.headers.get('Content-Type')).toContain('application/activity+json');
    const texts = [await page.text(), await list.text(), await object.text()];
    expect(texts[0]).toContain('このまとめは公開を想定していません。');
    expect(texts[2]).toContain('このまとめは公開を想定していません。');
    for (const text of texts) for (const secret of secrets) expect(text).not.toContain(secret);
  });

  it('トピックの記事を公開しても、公開ページの本文と ActivityPub の Article に X の投稿を出さない', async () => {
    const { request, topicId, publishDirectly } = await setup();
    publishDirectly(topicId);

    const page = await request(`/api/iori/v1/articles/${topicId}`);
    const list = await request('/api/iori/v1/articles');
    const object = await request(`/users/kosui/articles/${topicId}`, { headers: activity });

    expect(page.status).toBe(200);
    expect(object.status).toBe(200);
    const texts = [await page.text(), await list.text(), await object.text()];
    expect(texts[0]).toContain('News 1');
    expect(texts[2]).toContain('News 1');
    for (const text of texts) for (const secret of secrets) expect(text).not.toContain(secret);
  });
});
