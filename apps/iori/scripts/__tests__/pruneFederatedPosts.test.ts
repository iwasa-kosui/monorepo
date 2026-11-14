import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { createMastodonSeed } from '../../src/adaptor/d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../src/adaptor/d1/__tests__/sqliteFixture.ts';
import { candidateSql, dryRunSql, pruneFailureLines, pruneFederatedPosts } from '../prune-federated-posts.mjs';

const accountId = 'b'.repeat(32);
const token = 'api-token-value-for-fixture-0123456789';
const generation = 'prd20261102a';
const databaseName = `iori-production-${generation}`;
const databaseUuid = '11111111-1111-4111-8111-111111111111';
const databasePath = `/accounts/${accountId}/d1/database/${databaseUuid}`;
const now = 1_800_000_000_000;
const cutoff = now - 7 * 24 * 60 * 60 * 1000;
const old = cutoff - 1_000;
const env = (overrides: Record<string, string | undefined> = {}) => ({
  IORI_ENVIRONMENT: 'production',
  IORI_GENERATION: generation,
  CLOUDFLARE_ACCOUNT_ID: accountId,
  CLOUDFLARE_API_TOKEN: token,
  ...overrides,
});
const diag = (stage: string, reason: string) =>
  `IORI_DIAG stage=${stage} program=none exit=none signal=none reason=${reason}`;
const json = (result: unknown, status = 200) =>
  new Response(JSON.stringify({ success: status === 200, errors: [], messages: [], result }), { status });

type Fixture = ReturnType<typeof createSqliteD1Fixture>;
const rows = (fixture: Fixture, sql: string) => fixture.sqlite.prepare(sql).all() as Array<Record<string, unknown>>;
const snapshot = (fixture: Fixture) =>
  Object.fromEntries(
    (rows(fixture, 'SELECT name FROM sqlite_master WHERE type = \'table\' ORDER BY name') as Array<{ name: string }>)
      .map(({ name }) => [name, rows(fixture, `SELECT * FROM "${name}"`)]),
  );

const build = () => {
  const fixture = createSqliteD1Fixture();
  const seed = createMastodonSeed(fixture);
  const local = seed.addLocalActor('alice');
  const remote = seed.addRemoteActor('bob');
  const relayA = seed.addRelay();
  const relayB = seed.addRelay();
  const federated = (receivedAt: number | number[] = old, createdAt = now) => {
    const post = seed.addRemotePost(remote, createdAt);
    [receivedAt].flat().forEach((at, index) => seed.addFederatedItem(post.postId, index === 0 ? relayA : relayB, at));
    return post;
  };
  const remoteLike = (postId: string) =>
    fixture.sqlite.prepare('INSERT INTO likes(likeId,actorId,postId,type,createdAt) VALUES (?,?,?,?,?)').run(
      seed.uuid(),
      remote.actorId,
      postId,
      'remote',
      1,
    );
  const notification = (
    post: { postId: string },
    kind: 'like' | 'repost' | 'emoji' | 'reply' | 'original' | 'mention',
  ) => {
    if (kind === 'like') seed.addLikeNotification(local.userId, remote.actorId, post.postId, 1);
    if (kind === 'repost') seed.addRepostNotification(local.userId, remote.actorId, post.postId, 1);
    if (kind === 'emoji') seed.addEmojiReactNotification(local.userId, remote.actorId, post.postId, 1);
    if (kind === 'mention') seed.addMentionNotification(local.userId, remote.actorId, post.postId, 1);
    const other = seed.addLocalPost(local, 1, { timeline: false });
    if (kind === 'reply') seed.addReplyNotification(local.userId, remote.actorId, post.postId, other.postId, 1);
    if (kind === 'original') seed.addReplyNotification(local.userId, remote.actorId, other.postId, post.postId, 1);
  };

  const deletable = [
    federated(),
    federated([old, old - 5]),
    federated(old, 1),
    federated(old),
    federated(old),
    federated(old),
    federated(old),
  ];
  remoteLike(deletable[1].postId);
  seed.addEmojiReact(remote.actorId, deletable[2].postId, ':wave:');
  seed.addTimelineItem(remote.actorId, deletable[3].postId, 1, { deletedAt: 2 });
  seed.addRepost(remote.actorId, deletable[4].postId, 1, { timeline: false });
  fixture.sqlite.prepare('UPDATE remote_posts SET inReplyToUri = ? WHERE postId = ?').run(
    'https://remote.example/notes/elsewhere',
    deletable[5].postId,
  );
  const localTarget = seed.addLocalPost(local, 1, { timeline: false });
  fixture.sqlite.prepare('UPDATE remote_posts SET inReplyToUri = ? WHERE postId = ?').run(
    `${localTarget.uri}/`,
    deletable[6].postId,
  );

  const excluded = {
    local_likes: federated(),
    local_emoji: federated(),
    home: federated(),
    local_repost: federated(),
    replied: federated(),
    repliesToLocal: federated(),
    repliesToLocalFromOtherOrigin: federated(),
    notificationLike: federated(),
    notificationRepost: federated(),
    notificationEmoji: federated(),
    notificationReply: federated(),
    notificationOriginal: federated(),
    notificationMention: federated(),
    article: federated(),
    overlap: federated(),
  };
  seed.addLike(local.actorId, excluded.local_likes.postId);
  seed.addEmojiReact(local.actorId, excluded.local_emoji.postId, ':wave:');
  seed.addTimelineItem(remote.actorId, excluded.home.postId, 1);
  seed.addRepost(local.actorId, excluded.local_repost.postId, 1, { timeline: false });
  seed.addLocalPost(local, 1, { inReplyToUri: excluded.replied.uri, timeline: false });
  fixture.sqlite.prepare('UPDATE remote_posts SET inReplyToUri = ? WHERE postId = ?').run(
    localTarget.uri,
    excluded.repliesToLocal.postId,
  );
  const suffix = localTarget.uri.slice(localTarget.uri.indexOf('/users/'));
  fixture.sqlite.prepare('UPDATE remote_posts SET inReplyToUri = ? WHERE postId = ?').run(
    `https://other.example${suffix}`,
    excluded.repliesToLocalFromOtherOrigin.postId,
  );
  notification(excluded.notificationLike, 'like');
  notification(excluded.notificationRepost, 'repost');
  notification(excluded.notificationEmoji, 'emoji');
  notification(excluded.notificationReply, 'reply');
  notification(excluded.notificationOriginal, 'original');
  notification(excluded.notificationMention, 'mention');
  fixture.sqlite.prepare(
    'INSERT INTO articles(articleId,authorActorId,authorUserId,rootPostId,title,status,createdAt,publishedAt,unpublishedAt) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(seed.uuid(), local.actorId, local.userId, excluded.article.postId, 't', 'draft', 1, null, null);
  seed.addLike(local.actorId, excluded.overlap.postId);
  seed.addTimelineItem(remote.actorId, excluded.overlap.postId, 1);

  federated(cutoff);
  federated(cutoff + 1);
  federated([old, cutoff + 1]);
  seed.addRemotePost(remote, old);
  const localPost = seed.addLocalPost(local, old, { timeline: false });
  seed.addFederatedItem(localPost.postId, relayA, old);
  return { fixture, seed, local, remote, deletable, excluded };
};

const fakeFetch = (fixture: Fixture, options: { names?: string[]; uuid?: string } = {}) => {
  const calls: Array<{ method: string; path: string; sql?: string }> = [];
  const fetchRequest = async (url: URL, init: RequestInit) => {
    const path = url.pathname.replace('/client/v4', '');
    const method = String(init.method);
    const sql = init.body === undefined ? undefined : (JSON.parse(String(init.body)) as { sql: string }).sql;
    calls.push({ method, path, sql });
    if (method === 'GET' && path === `/accounts/${accountId}/d1/database`) {
      return json(
        (options.names ?? [databaseName, 'iori']).map((name) => ({ name, uuid: options.uuid ?? databaseUuid })),
      );
    }
    if (method === 'GET' && path === databasePath) return json({ name: databaseName, uuid: databaseUuid });
    if (method === 'POST' && path === `${databasePath}/query`) {
      return json([{ results: fixture.sqlite.prepare(sql!).all(), success: true, meta: {} }]);
    }
    return json(null, 404);
  };
  return { calls, fetchRequest: fetchRequest as unknown as typeof fetch };
};
const run = async (
  fixture: Fixture,
  overrides: Record<string, string | undefined> = {},
  options: { names?: string[]; uuid?: string; at?: number; mode?: string } = {},
) => {
  const { calls, fetchRequest } = fakeFetch(fixture, options);
  const notices: string[] = [];
  let error: unknown;
  try {
    await pruneFederatedPosts({
      env: env(overrides),
      mode: (options.mode ?? 'dry-run') as 'dry-run',
      fetchRequest,
      notice: (line) => notices.push(line),
      now: options.at ?? now,
    });
  } catch (caught) {
    error = caught;
  }
  const queries = calls.filter((call) => call.method === 'POST').map((call) => call.sql!);
  return { calls, queries, notices, error };
};
const writeStatement = /\b(?:INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|PRAGMA|ATTACH|VACUUM)\b(?!\s*\()/i;

describe('prune-federated-posts dry-run counts', () => {
  it('counts the candidates, each exclusion reason and the posts left to delete', async () => {
    const { fixture } = build();
    const { notices, error } = await run(fixture);
    expect(error).toBeUndefined();
    expect(notices).toEqual([
      `IORI_NOTICE prune-federated-posts mode=dry-run candidates=22 local_likes=2 local_emoji=1 home=2 local_repost=1 reply=3 notification=6 article=1 to_delete=7 cutoff_ms=${cutoff}`,
    ]);
  });
  it('sends exactly one SELECT after resolving the database and changes nothing', async () => {
    const { fixture } = build();
    const beforeRun = snapshot(fixture);
    const { calls, queries, error } = await run(fixture);
    expect(error).toBeUndefined();
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      `GET /accounts/${accountId}/d1/database`,
      `GET ${databasePath}`,
      `POST ${databasePath}/query`,
    ]);
    expect(queries).toEqual([dryRunSql(cutoff)]);
    expect(queries[0]).toMatch(/^SELECT /);
    expect(queries[0]).not.toMatch(writeStatement);
    expect(queries[0]).not.toContain(';');
    expect(snapshot(fixture)).toEqual(beforeRun);
  });
  it('uses the latest receivedAt and a strict comparison against the cutoff', () => {
    const { fixture, seed, remote } = build();
    const ids = (sql: string) => rows(fixture, sql).map((row) => String(row.postId));
    const boundary = seed.addRemotePost(remote, 1);
    seed.addFederatedItem(boundary.postId, seed.addRelay(), cutoff);
    expect(ids(candidateSql(cutoff))).not.toContain(boundary.postId);
    expect(ids(candidateSql(cutoff + 1))).toContain(boundary.postId);
    expect(ids(candidateSql(cutoff)).length).toBe(22);
  });
  it('leaves out a remote post that has no remote_posts row', () => {
    const { fixture, deletable } = build();
    fixture.sqlite.prepare('DELETE FROM remote_posts WHERE postId = ?').run(deletable[0].postId);
    const ids = rows(fixture, candidateSql(cutoff)).map((row) => String(row.postId));
    expect(ids).not.toContain(deletable[0].postId);
    expect(ids.length).toBe(21);
  });
});

describe('prune-federated-posts input checks', () => {
  it.each([
    ['staging', { IORI_ENVIRONMENT: 'staging' }],
    ['without a generation', { IORI_GENERATION: '' }],
    ['with a bad generation', { IORI_GENERATION: 'Bad-Generation' }],
    ['with a bad account id', { CLOUDFLARE_ACCOUNT_ID: 'not-hex' }],
  ])('fails without any request when the input is %s', async (_label, overrides) => {
    const { calls, error, notices } = await run(createSqliteD1Fixture(), overrides);
    expect(calls).toEqual([]);
    expect(notices).toEqual([]);
    expect(pruneFailureLines(error)).toEqual([diag('prune-posts', 'config-invalid')]);
  });
  it('rejects every mode except dry-run', async () => {
    const { calls, error } = await run(createSqliteD1Fixture(), {}, { mode: 'apply' });
    expect(calls).toEqual([]);
    expect(pruneFailureLines(error)).toEqual([diag('prune-posts', 'config-invalid')]);
  });
  it.each(['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'])(
    'fails without any request when %s is empty',
    async (name) => {
      const { calls, error } = await run(createSqliteD1Fixture(), { [name]: '' });
      expect(calls).toEqual([]);
      expect(pruneFailureLines(error)).toEqual([diag('prune-posts', 'credentials-missing')]);
    },
  );
  it.each([
    ['is missing', [], 'resource-missing'],
    ['is listed twice', [databaseName, databaseName], 'resource-ambiguous'],
    ['only has lookalikes', [`${databaseName}-x`, 'iori'], 'resource-missing'],
  ])('fails without a query when the D1 name %s', async (_label, names, reason) => {
    const { calls, error } = await run(createSqliteD1Fixture(), {}, { names });
    expect(calls.filter((call) => call.method === 'POST')).toEqual([]);
    expect(pruneFailureLines(error)).toEqual([diag('prune-posts-resolve', reason)]);
  });
  it('fails without a query when the listed id is not a UUID', async () => {
    const { calls, error } = await run(createSqliteD1Fixture(), {}, { uuid: '../../x' });
    expect(calls.filter((call) => call.method === 'POST')).toEqual([]);
    expect(pruneFailureLines(error)).toEqual([diag('prune-posts-resolve', 'result-invalid')]);
  });
  it('keeps the token, the account id and ids out of the failure lines', async () => {
    const { error } = await run(createSqliteD1Fixture(), {}, { names: [] });
    for (const line of pruneFailureLines(error)) {
      expect(line).not.toContain(token);
      expect(line).not.toContain(accountId);
      expect(line).not.toContain(databaseUuid);
    }
  });
});

describe('prune-federated-posts script source', () => {
  it('holds no SQL that writes', async () => {
    const source = await readFile(
      resolve(dirname(fileURLToPath(import.meta.url)), '..', 'prune-federated-posts.mjs'),
      'utf8',
    );
    expect(source.replace(/^import .*$/gm, '')).not.toMatch(writeStatement);
    expect(source).not.toMatch(/\bmethod: '(?:PUT|PATCH|DELETE)'/);
  });
});
