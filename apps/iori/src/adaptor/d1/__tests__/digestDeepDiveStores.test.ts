import { afterEach, describe, expect, it } from 'vitest';

import { ArticleId } from '../../../domain/article/articleId.ts';
import { ArticleBody } from '../../../domain/articleBody/articleBody.ts';
import { DigestItemId } from '../../../domain/digest/digestItemId.ts';
import { DigestDeepDive } from '../../../domain/digestDeepDive/digestDeepDive.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1DigestDeepDiveBodyWrittenStore } from '../digestDeepDive/digestDeepDiveBodyWrittenStore.ts';
import { createD1DigestDeepDiveResolverByDigestItemId } from '../digestDeepDive/digestDeepDiveResolverByDigestItemId.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const createdAt = Instant.orThrow(1_000);
const t1 = Instant.orThrow(5_000);
const t2 = Instant.orThrow(9_000);

const setup = (status = 'draft') => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const { sqlite, db } = fixture;
  const author = createMastodonSeed(fixture).addLocalActor('kosui');
  const userId = UserId.orThrow(author.userId);
  const articleId = ArticleId.generate();
  const digestItemId = DigestItemId.generate();
  sqlite.prepare(
    'INSERT INTO articles(articleId,authorActorId,authorUserId,rootPostId,title,status,createdAt,publishedAt,unpublishedAt) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(articleId, author.actorId, author.userId, null, 'Digest', status, createdAt, null, null);
  sqlite.prepare('INSERT INTO article_bodies(articleId,privateHtml,publicHtml,markdown,updatedAt) VALUES (?,?,?,?,?)')
    .run(articleId, '<p>old</p>', '<p>old</p>', '- old', createdAt);

  const store = createD1DigestDeepDiveBodyWrittenStore(db);
  const resolver = createD1DigestDeepDiveResolverByDigestItemId(db);
  const bodyAt = (at: Instant, markdown: string) =>
    ArticleBody.writeArticleBody(at)({
      articleId,
      privateHtml: `<p>${markdown}</p>`,
      publicHtml: `<p>${markdown}</p>`,
      markdown,
    });
  const started = (instruction: string, at: Instant) => {
    const result = DigestDeepDive.start(
      { userId, digestItemId, articleId, instruction, resultMarkdown: `- ${instruction}` },
      at,
    );
    if (!result.ok) throw new Error('start failed');
    return result.val;
  };
  const rows = (query: string) => sqlite.prepare(query).all();
  const body = () => sqlite.prepare('SELECT markdown, updatedAt FROM article_bodies').get();
  const eventNames = () =>
    (rows('SELECT eventName FROM domain_events ORDER BY rowid') as Array<{ eventName: string }>).map((row) =>
      row.eventName
    );
  return { sqlite, store, resolver, digestItemId, bodyAt, started, rows, body, eventNames };
};

describe('createD1DigestDeepDiveBodyWrittenStore', () => {
  it('始めた深掘りと最初の往復と本文を 1 回で書き、イベントを 2 つ残す', async () => {
    const { store, resolver, digestItemId, bodyAt, started, rows, body, eventNames } = setup();
    const event = started('背景', t1);

    const result = await store.store(event, bodyAt(t1, '- new'), createdAt);

    expect(result).toEqual({ ok: true, val: { written: true } });
    expect(body()).toEqual({ markdown: '- new', updatedAt: t1 });
    expect(rows('SELECT digestItemId, createdAt, updatedAt FROM digest_deep_dives')).toEqual([
      { digestItemId, createdAt: t1, updatedAt: t1 },
    ]);
    expect(rows('SELECT turnNumber, instruction, resultMarkdown, createdAt FROM digest_deep_dive_turns')).toEqual([
      { turnNumber: 1, instruction: '背景', resultMarkdown: '- 背景', createdAt: t1 },
    ]);
    expect(eventNames()).toEqual(['articleBody.written', 'digestDeepDive.started']);
    const resolved = await resolver.resolve(digestItemId);
    expect(resolved.val).toEqual(event.aggregateState);
  });

  it('続きの往復は、往復を足して updatedAt を進め、深掘りを 1 つのままにする', async () => {
    const { store, resolver, digestItemId, bodyAt, started, rows, body, eventNames } = setup();
    const first = started('背景', t1);
    await store.store(first, bodyAt(t1, '- first'), createdAt);
    const added = DigestDeepDive.addTurn(first.aggregateState, { instruction: '続き', resultMarkdown: '- 続き' }, t2);
    if (!added.ok) throw new Error('addTurn failed');

    const result = await store.store(added.val, bodyAt(t2, '- second'), t1);

    expect(result).toEqual({ ok: true, val: { written: true } });
    expect(body()).toEqual({ markdown: '- second', updatedAt: t2 });
    expect(rows('SELECT count(*) AS n FROM digest_deep_dives')).toEqual([{ n: 1 }]);
    expect(rows('SELECT updatedAt FROM digest_deep_dives')).toEqual([{ updatedAt: t2 }]);
    expect(rows('SELECT turnNumber, instruction FROM digest_deep_dive_turns ORDER BY turnNumber')).toEqual([
      { turnNumber: 1, instruction: '背景' },
      { turnNumber: 2, instruction: '続き' },
    ]);
    expect(eventNames()).toEqual([
      'articleBody.written',
      'digestDeepDive.started',
      'articleBody.written',
      'digestDeepDive.turnAdded',
    ]);
    const resolved = await resolver.resolve(digestItemId);
    expect(resolved.val?.turns.map((turn) => turn.turnNumber)).toEqual([1, 2]);
    expect(resolved.val?.updatedAt).toBe(t2);
  });

  it('本文の版が baseUpdatedAt と違えば（間に別の保存があれば）何も書かず written を false にする', async () => {
    const { store, resolver, digestItemId, bodyAt, started, rows, body, eventNames, sqlite } = setup();
    sqlite.prepare('UPDATE article_bodies SET markdown = ?, updatedAt = ?').run('- other', 3_000);

    const result = await store.store(started('背景', t1), bodyAt(t1, '- new'), createdAt);

    expect(result).toEqual({ ok: true, val: { written: false } });
    expect(body()).toEqual({ markdown: '- other', updatedAt: 3_000 });
    expect(rows('SELECT count(*) AS n FROM digest_deep_dives')).toEqual([{ n: 0 }]);
    expect(rows('SELECT count(*) AS n FROM digest_deep_dive_turns')).toEqual([{ n: 0 }]);
    expect(eventNames()).toEqual([]);
    expect((await resolver.resolve(digestItemId)).val).toBeUndefined();
  });

  it('続きの往復も、版が違えば往復も updatedAt も変えない', async () => {
    const { store, bodyAt, started, rows, body, eventNames, sqlite } = setup();
    const first = started('背景', t1);
    await store.store(first, bodyAt(t1, '- first'), createdAt);
    sqlite.prepare('UPDATE article_bodies SET markdown = ?, updatedAt = ?').run('- other', 6_000);
    const added = DigestDeepDive.addTurn(first.aggregateState, { instruction: '続き', resultMarkdown: '- 続き' }, t2);
    if (!added.ok) throw new Error('addTurn failed');

    const result = await store.store(added.val, bodyAt(t2, '- second'), t1);

    expect(result).toEqual({ ok: true, val: { written: false } });
    expect(body()).toEqual({ markdown: '- other', updatedAt: 6_000 });
    expect(rows('SELECT updatedAt FROM digest_deep_dives')).toEqual([{ updatedAt: t1 }]);
    expect(rows('SELECT count(*) AS n FROM digest_deep_dive_turns')).toEqual([{ n: 1 }]);
    expect(eventNames()).toEqual(['articleBody.written', 'digestDeepDive.started']);
  });

  it('確認の後、書き込みの前に published になっていたら、何も書かず written を false にする', async () => {
    const { store, bodyAt, started, rows, body, eventNames } = setup('published');

    const result = await store.store(started('背景', t1), bodyAt(t1, '- new'), createdAt);

    expect(result).toEqual({ ok: true, val: { written: false } });
    expect(body()).toEqual({ markdown: '- old', updatedAt: createdAt });
    expect(rows('SELECT count(*) AS n FROM digest_deep_dives')).toEqual([{ n: 0 }]);
    expect(eventNames()).toEqual([]);
  });
});

describe('createD1DigestDeepDiveResolverByDigestItemId', () => {
  it('深掘りの無い項目は undefined を返す', async () => {
    const { resolver } = setup();

    expect((await resolver.resolve(DigestItemId.generate())).val).toBeUndefined();
  });
});
