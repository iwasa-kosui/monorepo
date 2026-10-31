import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it, vi } from 'vitest';

import { APPLICATION_TABLE_ORDER } from '../export-postgres-lib.mjs';
import { reviewedD1Schema } from '../migration-d1-import.mjs';
import { preparationRecordKey, rehearsalTargetKey, serializePreparationRecord } from '../migration-target-contract.mjs';
import { purgeRehearsalTarget } from '../purge-rehearsal-target.mjs';
import { expectedTargetFixture, preparationFixture } from './migrationTargetFixture.js';

afterEach(() => {
  vi.restoreAllMocks();
});
const target = expectedTargetFixture();
const mark = (overrides: Record<string, unknown> = {}) =>
  Buffer.from(
    JSON.stringify({
      schema: 'iori-migration-rehearsal-target/v1',
      main_sha: target.identity.main_sha,
      run_id: target.identity.run_id,
      ...overrides,
    }) + '\n',
  );
const build = async (
  { objectCount = 3, markBody = mark() as Buffer | null, publicBucket = false } = {},
) => {
  const db = new DatabaseSync(':memory:');
  db.exec(await readFile(reviewedD1Schema, 'utf8'));
  db.exec('CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT)');
  db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run('0000_boring_xavin.sql');
  const actor = '11111111-1111-4111-8111-111111111111';
  const post = '22222222-2222-4222-8222-222222222222';
  const image = '33333333-3333-4333-8333-333333333333';
  const article = '44444444-4444-4444-8444-444444444444';
  db.prepare('INSERT INTO actors (actorId, uri, inboxUrl, type) VALUES (?, ?, ?, ?)').run(
    actor,
    'https://fixture.test/actor',
    'https://fixture.test/inbox',
    'Person',
  );
  db.prepare('INSERT INTO users VALUES (?, ?)').run('user', 'fixture');
  db.prepare('INSERT INTO posts (postId, actorId, content, createdAt, type) VALUES (?, ?, ?, ?, ?)').run(
    post,
    actor,
    'fixture',
    1,
    'note',
  );
  db.prepare('INSERT INTO post_images (imageId, postId, url, createdAt) VALUES (?, ?, ?, ?)').run(
    image,
    post,
    `/uploads/${image}.png`,
    1,
  );
  db.prepare(
    'INSERT INTO articles (articleId, authorActorId, authorUserId, rootPostId, title, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(article, actor, 'user', post, 'fixture article', 'published', 1);
  const statements: string[] = [];
  const state = { public: publicBucket, countOverride: undefined as number | undefined };
  const urls: { url: string; authorization: string | null }[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    const text = String(url);
    const headers = new Headers(init?.headers);
    urls.push({ url: text, authorization: headers.get('Authorization') });
    if (text.includes('/r2/buckets/')) {
      return new Response(
        JSON.stringify({
          success: true,
          result: text.endsWith('/managed') ? { enabled: state.public } : { domains: [] },
        }),
      );
    }
    const { sql } = JSON.parse(String(init?.body));
    statements.push(sql);
    if (sql.startsWith('SELECT')) {
      const results = db.prepare(sql).all() as { count: number }[];
      if (state.countOverride !== undefined) results[0]!.count = state.countOverride;
      return new Response(JSON.stringify({ success: true, result: [{ success: true, results }] }));
    }
    db.exec(sql);
    return new Response(JSON.stringify({ success: true, result: [{ success: true, results: [] }] }));
  };
  const objects = new Set(
    Array.from({ length: objectCount }, (_, index) => `og/${String(index).padStart(6, '0')}.png`),
  );
  const s3 = { lists: 0, batches: [] as number[], failWith: undefined as unknown, configs: [] as unknown[] };
  const createClient = (config: unknown) => {
    s3.configs.push(config);
    return {
      send: async (command: { constructor: { name: string }; input: any }) => {
        if (command.constructor.name === 'ListObjectsV2Command') {
          s3.lists++;
          const keys = [...objects].sort();
          const start = command.input.ContinuationToken ? Number(command.input.ContinuationToken) : 0;
          const page = keys.slice(start, start + command.input.MaxKeys);
          const next = start + page.length;
          return {
            Contents: page.map(Key => ({ Key })),
            KeyCount: page.length,
            IsTruncated: next < keys.length,
            ...(next < keys.length ? { NextContinuationToken: String(next) } : {}),
          };
        }
        if (command.constructor.name === 'DeleteObjectsCommand') {
          const batch = command.input.Delete.Objects as { Key: string }[];
          s3.batches.push(batch.length);
          if (s3.failWith) return s3.failWith;
          for (const { Key } of batch) objects.delete(Key);
          return {};
        }
        throw new Error('unexpected command');
      },
    };
  };
  const remote = new Map<string, Buffer>([[
    preparationRecordKey(target),
    serializePreparationRecord(preparationFixture()),
  ]]);
  if (markBody) remote.set(rehearsalTargetKey(target), markBody);
  const storageCalls: string[] = [];
  const storage = {
    assertPrivate: async () => {
      storageCalls.push('assertPrivate');
    },
    putNew: async () => {
      storageCalls.push('putNew');
    },
    get: async (key: string) => {
      storageCalls.push('get');
      if (!remote.has(key)) throw new Error('missing');
      return Buffer.from(remote.get(key)!);
    },
    getIfExists: async (key: string) => {
      storageCalls.push('getIfExists');
      return remote.has(key) ? Buffer.from(remote.get(key)!) : null;
    },
  };
  const options = {
    expectedTarget: target,
    storage,
    apiToken: 'fixture-token',
    accessKeyId: 'fixture-key',
    secretAccessKey: 'fixture-secret',
    fetchImpl,
    createClient,
  };
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get() as { count: number }).count;
  return { db, options, statements, state, urls, objects, s3, storageCalls, remote, count };
};
const applicationRows = (f: Awaited<ReturnType<typeof build>>) =>
  APPLICATION_TABLE_ORDER.reduce((sum, table) => sum + f.count(table), 0);

it('deletes every schema table in reverse import order, empties the uploads bucket and leaves D1 internals alone', async () => {
  const f = await build();
  try {
    expect(applicationRows(f)).toBeGreaterThan(0);
    await purgeRehearsalTarget(f.options);
    const deletes = f.statements.filter(sql => sql.startsWith('DELETE'));
    expect(deletes).toEqual([...APPLICATION_TABLE_ORDER].reverse().map(table => `DELETE FROM "${table}"`));
    for (const sql of f.statements) {
      expect(sql).toMatch(/^(?:DELETE FROM|SELECT COUNT\(\*\) AS count FROM) "([a-z_]+)"$/);
      expect(APPLICATION_TABLE_ORDER).toContain(/"([a-z_]+)"$/.exec(sql)![1]);
    }
    expect(f.statements.slice(0, deletes.length)).toEqual(deletes);
    expect(f.statements.slice(deletes.length).every(sql => sql.startsWith('SELECT COUNT(*)'))).toBe(true);
    expect(f.statements.slice(deletes.length)).toHaveLength(APPLICATION_TABLE_ORDER.length);
    expect(applicationRows(f)).toBe(0);
    expect(f.db.prepare('SELECT name FROM d1_migrations').all()).toEqual([{ name: '0000_boring_xavin.sql' }]);
    expect(f.objects.size).toBe(0);
  } finally {
    f.db.close();
  }
});
it('uses the schema tables exactly as the allowlist', async () => {
  const schema = await readFile(reviewedD1Schema, 'utf8');
  const names = [...schema.matchAll(/^CREATE TABLE `([a-z_]+)`/gm)].map(match => match[1]).sort();
  expect(names).toEqual([...APPLICATION_TABLE_ORDER].sort());
});
it('sends D1 statements to the target database with the migrate token and checks the uploads bucket privacy', async () => {
  const f = await build();
  try {
    await purgeRehearsalTarget(f.options);
    const privacy = f.urls.filter(entry => entry.url.includes('/r2/buckets/'));
    expect(privacy.map(entry => entry.url)).toEqual([
      `https://api.cloudflare.com/client/v4/accounts/${target.identity.account_id}/r2/buckets/${target.resources.uploads.name}/domains/managed`,
      `https://api.cloudflare.com/client/v4/accounts/${target.identity.account_id}/r2/buckets/${target.resources.uploads.name}/domains/custom`,
    ]);
    const d1 = f.urls.filter(entry => entry.url.includes('/d1/'));
    expect(d1.length).toBe(APPLICATION_TABLE_ORDER.length * 2);
    for (const entry of d1) {
      expect(entry.url).toBe(
        `https://api.cloudflare.com/client/v4/accounts/${target.identity.account_id}/d1/database/${target.resources.d1.id}/query`,
      );
    }
    for (const entry of f.urls) expect(entry.authorization).toBe('Bearer fixture-token');
    expect(f.s3.configs).toEqual([{
      region: 'auto',
      endpoint: `https://${target.identity.account_id}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: 'fixture-key', secretAccessKey: 'fixture-secret' },
      maxAttempts: 1,
    }]);
  } finally {
    f.db.close();
  }
});
it('accepts an injected D1 query function in place of the REST call', async () => {
  const f = await build();
  try {
    const queryD1 = vi.fn(async (sql: string) => {
      f.statements.push(sql);
      return sql.startsWith('SELECT') ? [{ count: 0 }] : [];
    });
    await purgeRehearsalTarget({ ...f.options, queryD1 });
    expect(queryD1).toHaveBeenCalledTimes(APPLICATION_TABLE_ORDER.length * 2);
    expect(f.urls.some(entry => entry.url.includes('/d1/'))).toBe(false);
  } finally {
    f.db.close();
  }
});
it('fails without deleting anything when the generation has no rehearsal mark', async () => {
  const f = await build({ markBody: null });
  try {
    await expect(purgeRehearsalTarget(f.options)).rejects.toThrow('Target generation was not used for rehearsal.');
    expect(f.statements).toEqual([]);
    expect(f.s3.lists).toBe(0);
    expect(f.s3.batches).toEqual([]);
    expect(applicationRows(f)).toBeGreaterThan(0);
    expect(f.urls).toEqual([]);
  } finally {
    f.db.close();
  }
});
it.each([
  ['run_id', { run_id: 'another-run' }],
  ['main_sha', { main_sha: 'b'.repeat(40) }],
  ['schema', { schema: 'iori-migration-rehearsal-target/v2' }],
  ['extra field', { extra: true }],
])('fails without deleting anything when the mark %s does not match', async (_label, overrides) => {
  const f = await build({ markBody: mark(overrides) });
  try {
    await expect(purgeRehearsalTarget(f.options)).rejects.toThrow('Rehearsal target mark');
    expect(f.statements).toEqual([]);
    expect(f.s3.batches).toEqual([]);
    expect(f.objects.size).toBe(3);
    expect(applicationRows(f)).toBeGreaterThan(0);
  } finally {
    f.db.close();
  }
});
it('fails without deleting anything when the mark is not JSON', async () => {
  const f = await build({ markBody: Buffer.from('not json') });
  try {
    await expect(purgeRehearsalTarget(f.options)).rejects.toThrow('Rehearsal target mark is invalid.');
    expect(f.statements).toEqual([]);
    expect(f.s3.batches).toEqual([]);
  } finally {
    f.db.close();
  }
});
it('fails closed on a missing preparation record before reading the mark or touching anything', async () => {
  const f = await build();
  try {
    f.remote.delete(preparationRecordKey(target));
    await expect(purgeRehearsalTarget(f.options)).rejects.toThrow();
    expect(f.storageCalls).not.toContain('getIfExists');
    expect(f.statements).toEqual([]);
    expect(f.s3.batches).toEqual([]);
  } finally {
    f.db.close();
  }
});
it('does not delete from D1 or R2 when the uploads bucket is public', async () => {
  const f = await build({ publicBucket: true });
  try {
    await expect(purgeRehearsalTarget(f.options)).rejects.toThrow('Migration bucket privacy preflight failed.');
    expect(f.statements).toEqual([]);
    expect(f.s3.lists).toBe(0);
    expect(f.s3.batches).toEqual([]);
    expect(f.objects.size).toBe(3);
    expect(applicationRows(f)).toBeGreaterThan(0);
  } finally {
    f.db.close();
  }
});
it('fails when a table still has rows after the delete', async () => {
  const f = await build();
  try {
    f.state.countOverride = 1;
    await expect(purgeRehearsalTarget(f.options)).rejects.toThrow('D1 application tables are not empty.');
    expect(f.s3.lists).toBe(0);
    expect(f.s3.batches).toEqual([]);
  } finally {
    f.db.close();
  }
});
it('deletes objects 1000 at a time across list pages', async () => {
  const f = await build({ objectCount: 2500 });
  try {
    await purgeRehearsalTarget(f.options);
    expect(f.s3.batches).toEqual([1000, 1000, 500]);
    expect(f.objects.size).toBe(0);
  } finally {
    f.db.close();
  }
});
it.each([
  ['an Errors entry', { Errors: [{ Key: 'og/secret-key.png', Code: 'AccessDenied', Message: 'secret-message' }] }],
  ['a non-array Errors value', { Errors: 'AccessDenied' }],
])('fails with a fixed message when DeleteObjects reports %s', async (_label, response) => {
  const f = await build();
  try {
    f.s3.failWith = response;
    const failure = await purgeRehearsalTarget(f.options).catch((error: Error) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe('Application R2 purge failed.');
    expect(f.objects.size).toBe(3);
  } finally {
    f.db.close();
  }
});
it('fails when objects remain after the delete', async () => {
  const f = await build();
  try {
    f.s3.failWith = {};
    await expect(purgeRehearsalTarget(f.options)).rejects.toThrow('Application R2 purge failed.');
  } finally {
    f.db.close();
  }
});
it('succeeds again on an already purged target, deleting nothing more', async () => {
  const f = await build();
  try {
    await purgeRehearsalTarget(f.options);
    const batches = [...f.s3.batches];
    await purgeRehearsalTarget(f.options);
    expect(f.s3.batches).toEqual(batches);
    expect(applicationRows(f)).toBe(0);
    expect(f.objects.size).toBe(0);
  } finally {
    f.db.close();
  }
});
it('succeeds on an empty D1 and an empty bucket without any DeleteObjects call', async () => {
  const f = await build({ objectCount: 0 });
  try {
    for (const table of [...APPLICATION_TABLE_ORDER].reverse()) f.db.exec(`DELETE FROM "${table}"`);
    await purgeRehearsalTarget(f.options);
    expect(f.s3.batches).toEqual([]);
  } finally {
    f.db.close();
  }
});
it('only reads the transfer storage and never writes to it', async () => {
  const f = await build();
  try {
    await purgeRehearsalTarget(f.options);
    expect(f.storageCalls).not.toContain('putNew');
    expect(new Set(f.storageCalls)).toEqual(new Set(['assertPrivate', 'get', 'getIfExists']));
    expect([...f.remote.keys()].sort()).toEqual([preparationRecordKey(target), rehearsalTargetKey(target)].sort());
  } finally {
    f.db.close();
  }
});
it('prints nothing', async () => {
  const f = await build();
  try {
    const log = vi.spyOn(console, 'log');
    const error = vi.spyOn(console, 'error');
    const write = vi.spyOn(process.stderr, 'write');
    await purgeRehearsalTarget(f.options);
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  } finally {
    f.db.close();
  }
});
