import { describe, expect, it } from 'vitest';

import { createSqliteD1Fixture } from '../../src/adaptor/d1/__tests__/sqliteFixture.ts';
import {
  baseStatements,
  buildReport,
  candidatesSql,
  cosineSimilarity,
  digestQualitySample,
  EMBEDDING_DIMENSIONS,
  GAP_HISTOGRAM,
  hexToEmbedding,
  histogram,
  materialsSql,
  noticeLines,
  PAGE_SIZE,
  parseTopics,
  rankTopics,
  sampleFailureLines,
  scoreCandidates,
  scoreItems,
  scoreMaterials,
  TOP1_HISTOGRAM,
} from '../digest-quality-sample.mjs';

const accountId = 'b'.repeat(32);
const token = 'api-token-value-for-fixture-0123456789';
const generation = 'prd20261102a';
const databaseName = `iori-production-${generation}`;
const databaseUuid = '11111111-1111-4111-8111-111111111111';
const databasePath = `/accounts/${accountId}/d1/database/${databaseUuid}`;
const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 5, 12, 0, 0);
const WRITE_WORDS = /\b(?:INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|PRAGMA|ATTACH|VACUUM)\b/i;
const env = (overrides: Record<string, string | undefined> = {}) => ({
  IORI_ENVIRONMENT: 'production',
  IORI_GENERATION: generation,
  CLOUDFLARE_ACCOUNT_ID: accountId,
  CLOUDFLARE_API_TOKEN: token,
  ...overrides,
});
const json = (result: unknown, status = 200) =>
  new Response(JSON.stringify({ success: status === 200, errors: [], messages: [], result }), { status });

const vec = (...values: number[]) => {
  const embedding = new Float32Array(EMBEDDING_DIMENSIONS);
  values.forEach((value, index) => embedding[index] = value);
  return embedding;
};
const bytes = (embedding: Float32Array) => Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
const hex = (embedding: Float32Array) => bytes(embedding).toString('hex').toUpperCase();

type Fixture = ReturnType<typeof createSqliteD1Fixture>;
const fixtureWithRows = () => {
  const fixture = createSqliteD1Fixture();
  fixture.sqlite.exec('PRAGMA foreign_keys=OFF');
  return fixture;
};
const addUser = (fixture: Fixture, userId: string, username: string) =>
  fixture.sqlite.prepare('INSERT INTO users (userId, username) VALUES (?, ?)').run(userId, username);
const addTopic = (
  fixture: Fixture,
  userId: string,
  topicKey: string,
  options: { embedding: Float32Array | null; enabled?: boolean; name?: string; description?: string; order?: number },
) =>
  fixture.sqlite.prepare(
    'INSERT INTO digest_topics (userId, topicKey, name, description, embedding, embeddedAt, sortOrder, enabled, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    userId,
    topicKey,
    options.name ?? `name-${topicKey}`,
    options.description ?? `description-${topicKey}`,
    options.embedding === null ? null : bytes(options.embedding),
    options.embedding === null ? null : now,
    options.order ?? 0,
    options.enabled === false ? 0 : 1,
    now,
    now,
  );
const addSource = (fixture: Fixture, feedSourceId: string, kind: string, enabled = true) =>
  fixture.sqlite.prepare(
    'INSERT INTO feed_sources (feedSourceId, kind, url, title, enabled, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(feedSourceId, kind, `https://feed.example/${feedSourceId}`, `source-${feedSourceId}`, enabled ? 1 : 0, now);
const addEntry = (
  fixture: Fixture,
  feedEntryId: string,
  feedSourceId: string,
  options: { fetchedAt: number; embedding: Float32Array | null; embedded?: boolean },
) =>
  fixture.sqlite.prepare(
    'INSERT INTO feed_entries (feedEntryId, feedSourceId, guid, url, title, description, fetchedAt, embedding, embeddedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    feedEntryId,
    feedSourceId,
    feedEntryId,
    `https://article.example/${feedEntryId}`,
    `title-${feedEntryId}`,
    'description',
    options.fetchedAt,
    options.embedding === null ? null : bytes(options.embedding),
    options.embedding !== null && options.embedded !== false ? now : null,
  );
const addDigestItem = (
  fixture: Fixture,
  digestId: string,
  userId: string,
  topicKey: string,
  createdAt: number,
  feedEntryId: string,
  feedback: string | null = null,
) => {
  fixture.sqlite.prepare(
    'INSERT INTO digests (digestId, userId, digestDate, articleId, createdAt, topicKey) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(digestId, userId, new Date(createdAt).toISOString().slice(0, 10), `article-${digestId}`, createdAt, topicKey);
  fixture.sqlite.prepare(
    'INSERT INTO digest_items (digestItemId, digestId, feedEntryId, url, title, rank, feedback) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    `item-${digestId}`,
    digestId,
    feedEntryId,
    `https://article.example/${feedEntryId}`,
    `title-${feedEntryId}`,
    1,
    feedback,
  );
};
const addMaterial = (
  fixture: Fixture,
  id: string,
  userId: string,
  kind: string,
  options: { embedding: Float32Array | null; deletedAt?: number | null },
) =>
  fixture.sqlite.prepare(
    'INSERT INTO interest_sources (interestSourceId, userId, kind, ref, contentHash, weight, occurredAt, embedding, embeddedAt, deletedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    userId,
    kind,
    `ref-${id}`,
    `hash-${id}`,
    1,
    now,
    options.embedding === null ? null : bytes(options.embedding),
    options.embedding === null ? null : now,
    options.deletedAt ?? null,
    now,
    now,
  );

const build = () => {
  const fixture = fixtureWithRows();
  addUser(fixture, 'u1', 'alice-private-name');
  addTopic(fixture, 'u1', 'ai', { embedding: vec(1, 0), order: 1 });
  addTopic(fixture, 'u1', 'web', { embedding: vec(0, 1), order: 2 });
  addTopic(fixture, 'u1', 'off', { embedding: vec(1, 1), enabled: false, order: 3 });
  addTopic(fixture, 'u1', 'pending', { embedding: null, order: 4 });
  addSource(fixture, 'old', 'other');
  addEntry(fixture, 'e1', 'old', { fetchedAt: now - 10 * DAY, embedding: vec(1, 0.1) });
  addEntry(fixture, 'e2', 'old', { fetchedAt: now - 10 * DAY, embedding: vec(0.1, 1) });
  addEntry(fixture, 'e3', 'old', { fetchedAt: now - 10 * DAY, embedding: null });
  addDigestItem(fixture, 'd1', 'u1', 'ai', now - DAY, 'e1', 'like');
  addDigestItem(fixture, 'd2', 'u1', 'ai', now - 2 * DAY, 'e2');
  addDigestItem(fixture, 'd3', 'u1', 'web', now - 3 * DAY, 'e3');
  addDigestItem(fixture, 'd4', 'u1', 'ai', now - 20 * DAY, 'e1');
  addDigestItem(fixture, 'd5', 'u1', 'summary', now - DAY, 'e1');
  addSource(fixture, 'rss', 'rss');
  addSource(fixture, 'hatena', 'hatena_hotentry');
  addSource(fixture, 'disabled', 'rss', false);
  addEntry(fixture, 'c1', 'rss', { fetchedAt: now - DAY, embedding: vec(1, 0) });
  addEntry(fixture, 'c2', 'hatena', { fetchedAt: now - 2 * DAY, embedding: vec(0, 1) });
  addEntry(fixture, 'c3', 'rss', { fetchedAt: now - 3 * DAY + 1000, embedding: vec(1, 1) });
  addEntry(fixture, 'c4', 'rss', { fetchedAt: now - DAY, embedding: vec(0, 0, 1) });
  addEntry(fixture, 'x-old', 'rss', { fetchedAt: now - 4 * DAY, embedding: vec(1, 0) });
  addEntry(fixture, 'x-disabled', 'disabled', { fetchedAt: now - DAY, embedding: vec(1, 0) });
  addEntry(fixture, 'x-other', 'old', { fetchedAt: now - DAY, embedding: vec(1, 0) });
  addEntry(fixture, 'x-pending', 'rss', { fetchedAt: now - DAY, embedding: vec(1, 0), embedded: false });
  addMaterial(fixture, 'm1', 'u1', 'bookmark', { embedding: vec(1, 0) });
  addMaterial(fixture, 'm2', 'u1', 'bookmark', { embedding: vec(1, 1) });
  addMaterial(fixture, 'm3', 'u1', 'like', { embedding: vec(0, 0, 1) });
  addMaterial(fixture, 'm4', 'u1', 'like', { embedding: vec(1, 0), deletedAt: now });
  addMaterial(fixture, 'm5', 'u1', 'like', { embedding: null });
  return fixture;
};

type Call = { method: string; path: string; sql?: string };
const fakeFetch = (fixture: Fixture, options: { names?: string[] } = {}) => {
  const calls: Call[] = [];
  const fetchRequest = async (url: URL, init: RequestInit) => {
    const path = url.pathname.replace('/client/v4', '');
    const method = String(init.method);
    const sql = init.body === undefined ? undefined : (JSON.parse(String(init.body)) as { sql: string }).sql;
    calls.push({ method, path, sql });
    if (method === 'GET' && path === `/accounts/${accountId}/d1/database`) {
      return json((options.names ?? [databaseName, 'iori']).map((name) => ({ name, uuid: databaseUuid })));
    }
    if (method === 'GET' && path === databasePath) return json({ name: databaseName, uuid: databaseUuid });
    if (method === 'POST' && path === `${databasePath}/query`) {
      return json(
        sql!.split(';\n').map((statement) => ({
          results: fixture.sqlite.prepare(statement).all(),
          success: true,
          meta: {},
        })),
      );
    }
    return json(null, 404);
  };
  return { calls, fetchRequest: fetchRequest as unknown as typeof fetch };
};
const run = async (
  fixture: Fixture,
  overrides: Record<string, string | undefined> = {},
  options: { names?: string[] } = {},
) => {
  const { calls, fetchRequest } = fakeFetch(fixture, options);
  const notices: string[] = [];
  const outputs: string[] = [];
  let error: unknown;
  try {
    await digestQualitySample({
      env: env(overrides),
      fetchRequest,
      notice: (line) => notices.push(line),
      output: (text) => outputs.push(text),
      now,
    });
  } catch (caught) {
    error = caught;
  }
  const queries = calls.filter((call) => call.method === 'POST').map((call) => call.sql!);
  return { calls, queries, notices, outputs, error };
};

describe('digest-quality-sample SQL', () => {
  it('builds only SELECT statements', () => {
    const statements = [
      ...baseStatements(now),
      candidatesSql(now),
      candidatesSql(now, 'entry-1'),
      materialsSql(),
      materialsSql('source-1'),
    ];
    expect(statements).toHaveLength(6);
    for (const sql of statements) {
      expect(sql).toMatch(/^SELECT /);
      expect(sql).not.toMatch(WRITE_WORDS);
      expect(sql).not.toContain(';');
    }
  });
  it('reads only the columns the counts and distributions need', () => {
    const statements = [...baseStatements(now), candidatesSql(now), materialsSql()];
    for (const sql of statements) {
      expect(sql).not.toMatch(/\b(?:title|url|name|description|ref|feedback|digestDate|rank)\b/);
    }
  });
  it('rejects a paging cursor that is not a plain identifier with the cursor-invalid reason', () => {
    for (const build of [() => candidatesSql(now, '\'; DROP TABLE users; --'), () => materialsSql('a b')]) {
      let caught: unknown;
      try {
        build();
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(sampleFailureLines(caught)).toEqual([
        'IORI_DIAG stage=digest-quality-query program=none exit=none signal=none reason=cursor-invalid',
      ]);
    }
  });
  it('sends only SELECT statements to D1 and changes nothing', async () => {
    const fixture = build();
    const tables = ['digest_topics', 'digests', 'digest_items', 'feed_entries', 'feed_sources', 'interest_sources'];
    const snapshot = () => tables.map((table) => fixture.sqlite.prepare(`SELECT * FROM ${table}`).all());
    const before = snapshot();
    const { queries, error } = await run(fixture);
    expect(error).toBeUndefined();
    expect(queries).toHaveLength(3);
    for (const statement of queries.flatMap((query) => query.split(';\n'))) {
      expect(statement).toMatch(/^SELECT /);
      expect(statement).not.toMatch(WRITE_WORDS);
    }
    expect(snapshot()).toEqual(before);
  });
});

describe('similarity', () => {
  it('restores a Float32Array from the little-endian hex of the stored blob', () => {
    const restored = hexToEmbedding(`0000803F000000C0${'00000000'.repeat(EMBEDDING_DIMENSIONS - 2)}`);
    expect(restored).toHaveLength(EMBEDDING_DIMENSIONS);
    expect([restored![0], restored![1], restored![2]]).toEqual([1, -2, 0]);
    const original = vec(0.5, -2, 3.25);
    expect(Array.from(hexToEmbedding(hex(original))!)).toEqual(Array.from(original));
    expect(Array.from(hexToEmbedding(hex(original).toLowerCase())!)).toEqual(Array.from(original));
  });
  it('rejects hex of the wrong size or with other characters', () => {
    expect(hexToEmbedding('')).toBeNull();
    expect(hexToEmbedding(null)).toBeNull();
    expect(hexToEmbedding('0000803F')).toBeNull();
    expect(hexToEmbedding(`zz${hex(vec(1)).slice(2)}`)).toBeNull();
  });
  it('computes the cosine of known vectors', () => {
    expect(cosineSimilarity(new Float32Array([1, 2, 3]), new Float32Array([1, 2, 3]))).toBeCloseTo(1, 6);
    expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([0, 1]))).toBe(0);
    expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([-2, 0]))).toBeCloseTo(-1, 6);
    expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([1, 1]))).toBeCloseTo(Math.SQRT1_2, 6);
    expect(cosineSimilarity(new Float32Array([3, 4]), new Float32Array([4, 3]))).toBeCloseTo(24 / 25, 6);
    expect(cosineSimilarity(new Float32Array([0, 0]), new Float32Array([1, 1]))).toBe(0);
    expect(cosineSimilarity(new Float32Array([1]), new Float32Array([1, 1]))).toBe(0);
  });
  it('computes the cosine through the hex round trip', () => {
    const a = hexToEmbedding(hex(vec(3, 4)))!;
    const b = hexToEmbedding(hex(vec(4, 3)))!;
    expect(cosineSimilarity(a, b)).toBeCloseTo(24 / 25, 6);
  });
});

describe('ranking', () => {
  const topics = [
    { topicKey: 'ai', vector: vec(1, 0) },
    { topicKey: 'web', vector: vec(0, 1) },
    { topicKey: 'mix', vector: vec(1, 1) },
  ];
  it('returns the first and second topic with their gap', () => {
    const ranked = rankTopics(vec(1, 0.2), topics)!;
    const norm = Math.hypot(1, 0.2);
    expect(ranked.first.topicKey).toBe('ai');
    expect(ranked.first.similarity).toBeCloseTo(1 / norm, 5);
    expect(ranked.second!.topicKey).toBe('mix');
    expect(ranked.second!.similarity).toBeCloseTo(1.2 / (norm * Math.SQRT2), 5);
    expect(ranked.gap).toBeCloseTo(ranked.first.similarity - ranked.second!.similarity, 9);
  });
  it('has no second topic or gap with one topic, and nothing with none', () => {
    const ranked = rankTopics(vec(1, 0), [topics[0]])!;
    expect(ranked).toMatchObject({ first: { topicKey: 'ai' }, second: null, gap: null });
    expect(rankTopics(vec(1, 0), [])).toBeNull();
  });
  it('gives a zero gap to tied topics', () => {
    const ranked = rankTopics(vec(1, 1), [topics[0], topics[1]])!;
    expect(ranked.first.topicKey).toBe('ai');
    expect(ranked.second!.topicKey).toBe('web');
    expect(ranked.gap).toBeCloseTo(0, 6);
  });
  it('judges whether the first topic equals the adopted topic and skips disabled or unembedded topics', () => {
    const topicsByUser = parseTopics([
      { userId: 'u', topicKey: 'ai', name: 'n', description: 'd', enabled: 1, embedded: 1, embedding: hex(vec(1, 0)) },
      { userId: 'u', topicKey: 'web', name: 'n', description: 'd', enabled: 1, embedded: 1, embedding: hex(vec(0, 1)) },
      { userId: 'u', topicKey: 'off', name: 'n', description: 'd', enabled: 0, embedded: 1, embedding: hex(vec(1, 1)) },
      { userId: 'u', topicKey: 'none', name: 'n', description: 'd', enabled: 1, embedded: 0, embedding: null },
    ]);
    const row = (topicKey: string, embedding: Float32Array | null) => ({
      userId: 'u',
      topicKey,
      embedding: embedding === null ? null : hex(embedding),
    });
    const items = scoreItems(
      [row('ai', vec(1, 0.1)), row('web', vec(1, 0.1)), row('ai', vec(1, 1)), row('ai', null)],
      topicsByUser,
    ).get('u')!;
    expect(items.map((item) => item.matched)).toEqual([true, false, true, null]);
    expect(items.map((item) => item.first?.topicKey ?? null)).toEqual(['ai', 'ai', 'ai', null]);
    expect(items[0].gap).toBeGreaterThan(0);
    expect(items[3]).toMatchObject({ first: null, gap: null });
  });
});

describe('histogram', () => {
  it('counts below, in-range and at-or-above values with the requested step', () => {
    const hist = histogram([0.1, 0.2, 0.249, 0.25, 0.55, 0.79, 0.8, 0.95], TOP1_HISTOGRAM);
    expect(hist.below).toBe(1);
    expect(hist.buckets).toEqual([2, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(hist.atOrAbove).toBe(2);
    const gap = histogram([0, 0.019, 0.02, 0.05, 0.199, 0.2], GAP_HISTOGRAM);
    expect(gap.buckets).toEqual([2, 1, 1, 0, 0, 0, 0, 0, 0, 1]);
    expect(gap.atOrAbove).toBe(1);
  });
});

describe('digest-quality-sample result', () => {
  it('collects items, candidates and materials per user', async () => {
    const { outputs, error } = await run(build());
    expect(error).toBeUndefined();
    const report = JSON.parse(outputs[0]);
    expect(report.users).toHaveLength(1);
    const [user] = report.users;
    expect(user.topicCounts).toEqual({ total: 4, enabled: 3, embedded: 2 });
    expect(user.items).toMatchObject({ total: 3, scored: 2, matched: 1 });
    expect(user.candidates.total).toBe(4);
    expect(user.candidates.atLeast).toEqual({ '0.40': 3, '0.45': 3, '0.50': 3, '0.55': 3, '0.60': 3 });
    expect(user.materials.total).toBe(3);
    expect(user.materials.byKind).toEqual([
      { kind: 'bookmark', total: 2, atLeast: { '0.40': 2, '0.50': 2 } },
      { kind: 'like', total: 1, atLeast: { '0.40': 0, '0.50': 0 } },
    ]);
  });
  it('outputs only counts and distributions as JSON', async () => {
    const { outputs, error } = await run(build());
    expect(error).toBeUndefined();
    const [user] = JSON.parse(outputs[0]).users;
    expect(Object.keys(JSON.parse(outputs[0])).sort()).toEqual(['generatedAt', 'users']);
    expect(Object.keys(user).sort()).toEqual(['candidates', 'items', 'materials', 'topicCounts', 'user']);
    expect(Object.keys(user.items).sort()).toEqual(['gapHistogram', 'matched', 'scored', 'top1Histogram', 'total']);
    expect(Object.keys(user.candidates).sort()).toEqual(['atLeast', 'gapHistogram', 'top1Histogram', 'total']);
    expect(Object.keys(user.materials).sort()).toEqual(['byKind', 'total']);
  });
  it('pages through the candidates', async () => {
    const fixture = fixtureWithRows();
    addTopic(fixture, 'u1', 'ai', { embedding: vec(1, 0) });
    addSource(fixture, 'rss', 'rss');
    for (let index = 0; index < PAGE_SIZE + 50; index += 1) {
      addEntry(fixture, `c${String(index).padStart(4, '0')}`, 'rss', { fetchedAt: now - 1000, embedding: vec(1, 0) });
    }
    const { queries, outputs, error } = await run(fixture);
    expect(error).toBeUndefined();
    expect(queries.filter((sql) => sql.includes('FROM feed_entries e JOIN feed_sources'))).toHaveLength(2);
    expect(JSON.parse(outputs[0]).users[0].candidates.total).toBe(PAGE_SIZE + 50);
  });
  it('reports an empty database without failing', async () => {
    const { outputs, notices, error } = await run(fixtureWithRows());
    expect(error).toBeUndefined();
    expect(JSON.parse(outputs[0]).users).toEqual([]);
    expect(notices).toEqual(['IORI_NOTICE digest-quality-sample overview users=0']);
  });
});

describe('digest-quality-sample public log', () => {
  const secrets = [
    'Secret Article Title',
    'https://secret.example/path?token=abc',
    'Secret Topic Name',
    'Secret topic description about health',
    'secret-username-alice',
    'secret-topic-key',
    'secret-material-reference',
  ];
  const secretReport = () => {
    const topicsByUser = parseTopics([
      { userId: secrets[4], topicKey: secrets[5], enabled: 1, embedded: 1, embedding: hex(vec(1, 0)) },
      { userId: secrets[4], topicKey: 'other', enabled: 1, embedded: 1, embedding: hex(vec(0, 1)) },
    ]);
    const items = scoreItems([{
      userId: secrets[4],
      topicKey: secrets[5],
      embedding: hex(vec(1, 0.3)),
    }], topicsByUser);
    const candidates = scoreCandidates([{ embedding: hex(vec(1, 0.5)) }], topicsByUser);
    const materials = scoreMaterials([
      { userId: secrets[4], kind: 'bookmark', embedding: hex(vec(1, 0.2)) },
      { userId: secrets[4], kind: `Secret Kind ${secrets[6]}`, embedding: hex(vec(0, 1)) },
    ], topicsByUser);
    return buildReport({ now, topicsByUser, items, candidates, materials });
  };
  const secretFixture = () => {
    const fixture = fixtureWithRows();
    addUser(fixture, secrets[4], secrets[4]);
    addTopic(fixture, secrets[4], secrets[5], {
      embedding: vec(1, 0),
      name: secrets[2],
      description: secrets[3],
      order: 1,
    });
    addTopic(fixture, secrets[4], 'other', {
      embedding: vec(0, 1),
      name: secrets[2],
      description: secrets[3],
      order: 2,
    });
    addSource(fixture, 'rss', 'rss');
    fixture.sqlite.prepare(
      'INSERT INTO feed_entries (feedEntryId, feedSourceId, guid, url, title, description, fetchedAt, embedding, embeddedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('c1', 'rss', 'c1', secrets[1], secrets[0], secrets[3], now - DAY, bytes(vec(1, 0.5)), now);
    fixture.sqlite.prepare(
      'INSERT INTO digests (digestId, userId, digestDate, articleId, createdAt, topicKey) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('d1', secrets[4], '2026-11-04', 'article-d1', now - DAY, secrets[5]);
    fixture.sqlite.prepare(
      'INSERT INTO digest_items (digestItemId, digestId, feedEntryId, url, title, rank, feedback) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run('item-d1', 'd1', 'c1', secrets[1], secrets[0], 1, secrets[3]);
    addMaterial(fixture, secrets[6], secrets[4], `Secret Kind ${secrets[6]}`, { embedding: vec(1, 0.2) });
    fixture.sqlite.prepare('UPDATE interest_sources SET ref = ?').run(secrets[6]);
    return fixture;
  };
  it('contains none of the titles, URLs, topic names, descriptions, bodies, topic keys or user names', () => {
    const report = secretReport();
    const lines = noticeLines(report);
    const joined = lines.join('\n');
    for (const secret of secrets) expect(joined).not.toContain(secret);
    expect(joined).not.toMatch(/secret/i);
    expect(lines.every((line) => /^IORI_NOTICE digest-quality-sample /.test(line))).toBe(true);
  });
  it('keeps the same details out of the JSON report', () => {
    const json = JSON.stringify(secretReport());
    for (const secret of secrets) expect(json).not.toContain(secret);
    expect(json).not.toMatch(/secret/i);
  });
  it('keeps the same details out of the standard output and the notices of a run against stored rows', async () => {
    const { outputs, notices, error } = await run(secretFixture());
    expect(error).toBeUndefined();
    expect(outputs).toHaveLength(1);
    expect(JSON.parse(outputs[0]).users).toHaveLength(1);
    expect(JSON.parse(outputs[0]).users[0].items).toMatchObject({ total: 1, scored: 1, matched: 1 });
    for (const text of [...outputs, ...notices]) {
      for (const secret of secrets) expect(text).not.toContain(secret);
      expect(text).not.toMatch(/secret/i);
    }
  });
  it('prints counts and distributions with the fixed vocabulary', () => {
    const lines = noticeLines(secretReport());
    expect(lines[0]).toBe('IORI_NOTICE digest-quality-sample overview users=1');
    expect(lines[1]).toBe(
      'IORI_NOTICE digest-quality-sample user=1 summary topics=2 enabled=2 embedded=2 items=1 scored=1 matched=1 match_rate=1.000',
    );
    expect(lines[2]).toMatch(
      /^IORI_NOTICE digest-quality-sample user=1 hist=item_top1 lt0\.20=0 b0\.20=0 .* b0\.75=0 ge0\.80=1$/,
    );
    expect(lines[3]).toMatch(
      /^IORI_NOTICE digest-quality-sample user=1 hist=item_gap lt0\.00=0 b0\.00=0 .* b0\.18=0 ge0\.20=1$/,
    );
    expect(lines[4]).toBe(
      'IORI_NOTICE digest-quality-sample user=1 candidates total=1 ge0.40=1 ge0.45=1 ge0.50=1 ge0.55=1 ge0.60=1',
    );
    expect(lines.slice(5).sort()).toEqual([
      'IORI_NOTICE digest-quality-sample user=1 material kind=bookmark total=1 ge0.40=1 ge0.50=1',
      'IORI_NOTICE digest-quality-sample user=1 material kind=other total=1 ge0.40=1 ge0.50=1',
    ]);
  });
});

describe('digest-quality-sample input and database checks', () => {
  it.each([
    ['staging', { IORI_ENVIRONMENT: 'staging' }],
    ['without a generation', { IORI_GENERATION: '' }],
    ['with a bad account id', { CLOUDFLARE_ACCOUNT_ID: 'not-hex' }],
    ['without an account id', { CLOUDFLARE_ACCOUNT_ID: '' }],
    ['without a token', { CLOUDFLARE_API_TOKEN: '' }],
  ])('fails without any request when the input is %s', async (_label, overrides) => {
    const { calls, error, outputs } = await run(fixtureWithRows(), overrides);
    expect(calls).toEqual([]);
    expect(outputs).toEqual([]);
    expect(sampleFailureLines(error)).toHaveLength(1);
    expect(sampleFailureLines(error)[0]).toMatch(/^IORI_DIAG stage=digest-quality program=none /);
  });
  it('fails without a query when the D1 name is missing, and keeps ids out of the failure lines', async () => {
    const { calls, error } = await run(fixtureWithRows(), {}, { names: [] });
    expect(calls.filter((call) => call.method === 'POST')).toEqual([]);
    const lines = sampleFailureLines(error);
    expect(lines).toEqual([
      'IORI_DIAG stage=digest-quality-resolve program=none exit=none signal=none reason=resource-missing',
    ]);
    for (const line of lines) {
      expect(line).not.toContain(token);
      expect(line).not.toContain(accountId);
      expect(line).not.toContain(databaseUuid);
    }
  });
});
