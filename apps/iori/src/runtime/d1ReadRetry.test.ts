import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSqliteD1Fixture } from '../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1SessionResolver } from '../adaptor/d1/session/sessionResolver.ts';
import { isTransientD1Error, withD1ReadRetry } from './d1ReadRetry.ts';
import { createD1TimingCollector, instrumentD1 } from './d1Timing.ts';

const transient = () => new Error('D1_ERROR: Network connection lost.');
const syntaxError = () => new Error('D1_ERROR: near "SELEC": syntax error at offset 0');

type Method = 'first' | 'all' | 'raw' | 'run';
const methods: readonly Method[] = ['first', 'all', 'raw', 'run'];

const createFake = (failures: Array<Error | undefined>) => {
  const calls: Array<{ sql: string; method: Method; params: unknown[] }> = [];
  const created: D1PreparedStatement[] = [];
  const statement = (sql: string, params: unknown[]) => {
    const invoke = (method: Method) => async () => {
      calls.push({ sql, method, params });
      const failure = failures.shift();
      if (failure !== undefined) throw failure;
      return { method };
    };
    const self = {
      bind: (...values: unknown[]) => statement(sql, values),
      first: invoke('first'),
      all: invoke('all'),
      raw: invoke('raw'),
      run: invoke('run'),
    };
    created.push(self as unknown as D1PreparedStatement);
    return self as unknown as D1PreparedStatement;
  };
  const batch = vi.fn(async (statements: unknown[]) => statements.map(() => ({ results: [] })));
  const db = { prepare: (sql: string) => statement(sql, []), batch, exec: vi.fn(), dump: vi.fn() };
  return { db: db as unknown as D1Database, calls, created, batch, raw: db };
};

const invoke = (statement: D1PreparedStatement, method: Method): Promise<unknown> =>
  (statement as unknown as Record<Method, () => Promise<unknown>>)[method]();

const noSleep = () => vi.fn(async (_ms: number) => {});
const noJitter = () => 0;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('withD1ReadRetry', () => {
  it.each(['first', 'all', 'raw'] as const)(
    'SELECT の %s が一時的なエラーで 1 回失敗した後に成功すると、結果を返す',
    async (method) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fake = createFake([transient()]);
      const sleep = noSleep();
      const db = withD1ReadRetry(fake.db, { sleep, random: noJitter });

      await expect(invoke(db.prepare('SELECT 1'), method)).resolves.toEqual({ method });

      expect(fake.calls).toHaveLength(2);
      expect(sleep).toHaveBeenCalledTimes(1);
      expect(sleep).toHaveBeenCalledWith(50);
    },
  );

  it('既定では 3 回で止め、再試行の前に 50ms と 150ms 待つ', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const last = new Error('D1_ERROR: Network connection lost. (last)');
    const fake = createFake([transient(), transient(), last, transient()]);
    const sleep = noSleep();
    const db = withD1ReadRetry(fake.db, { sleep, random: noJitter });

    await expect(db.prepare('SELECT 1').all()).rejects.toBe(last);

    expect(fake.calls).toHaveLength(3);
    expect(sleep.mock.calls).toEqual([[50], [150]]);
  });

  it('待ち時間に 0〜50% のジッターを足す', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fake = createFake([transient(), transient()]);
    const sleep = noSleep();
    const db = withD1ReadRetry(fake.db, { sleep, random: () => 0.5 });

    await db.prepare('SELECT 1').all();

    expect(sleep.mock.calls).toEqual([[62.5], [187.5]]);
  });

  it('overloaded のエラーは再試行しない', async () => {
    const fake = createFake([new Error('D1_ERROR: D1 DB is overloaded. Requests queued for too long.')]);
    const sleep = noSleep();
    const db = withD1ReadRetry(fake.db, { sleep, random: noJitter });

    await expect(db.prepare('SELECT 1').all()).rejects.toThrow('D1 DB is overloaded');

    expect(fake.calls).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('SQL のエラーは再試行せず 1 回で throw する', async () => {
    const error = syntaxError();
    const fake = createFake([error]);
    const sleep = noSleep();
    const db = withD1ReadRetry(fake.db, { sleep, random: noJitter });

    await expect(db.prepare('SELEC 1').all()).rejects.toBe(error);

    expect(fake.calls).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it.each(
    [
      'INSERT INTO t(a) VALUES (1)',
      'WITH x AS (SELECT 1) SELECT * FROM x',
    ] as const,
  )('書き込みと with で始まる SQL は、一時的なエラーでも再試行しない: %s', async (sql) => {
    for (const method of methods) {
      const fake = createFake([transient()]);
      const sleep = noSleep();
      const db = withD1ReadRetry(fake.db, { sleep, random: noJitter });

      await expect(invoke(db.prepare(sql), method)).rejects.toThrow('Network connection lost');

      expect(fake.calls).toHaveLength(1);
      expect(sleep).not.toHaveBeenCalled();
    }
  });

  it('SELECT の run は再試行しない', async () => {
    const fake = createFake([transient()]);
    const sleep = noSleep();
    const db = withD1ReadRetry(fake.db, { sleep, random: noJitter });

    await expect(db.prepare('SELECT 1').run()).rejects.toThrow('Network connection lost');

    expect(fake.calls).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('先頭の空白とコメントを除いて select で始まり、大文字小文字を区別しない', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const sql of ['  \n select 1', '-- note\nSelect 1', '/* note */ /* more */ sElEcT 1']) {
      const fake = createFake([transient()]);
      const db = withD1ReadRetry(fake.db, { sleep: noSleep(), random: noJitter });

      await expect(db.prepare(sql).all()).resolves.toEqual({ method: 'all' });

      expect(fake.calls).toHaveLength(2);
    }
  });

  it('bind した statement でも再試行が効き、同じパラメータで再実行する', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fake = createFake([transient()]);
    const sleep = noSleep();
    const db = withD1ReadRetry(fake.db, { sleep, random: noJitter });

    await expect(db.prepare('SELECT * FROM t WHERE id = ?').bind('a').all()).resolves.toEqual({ method: 'all' });

    expect(fake.calls.map((call) => call.params)).toEqual([['a'], ['a']]);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('再試行したときは試行回数とメッセージだけを console.warn に出し、パラメータは出さない', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fake = createFake([new Error(`D1_ERROR: Network connection lost. ${'x'.repeat(500)}`)]);
    const db = withD1ReadRetry(fake.db, { sleep: noSleep(), random: noJitter });

    await db.prepare('SELECT * FROM t WHERE id = ?').bind('secret-param').all();

    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).toContain('1/3');
    expect(line).not.toContain('secret-param');
    expect(line.length).toBeLessThan(300);
  });

  it('batch は元の statement の配列で元の db.batch を呼ぶ', async () => {
    const fake = createFake([]);
    const db = withD1ReadRetry(fake.db);

    const bound = db.prepare('SELECT 1').bind('a');
    const plain = db.prepare('INSERT INTO t VALUES (1)');
    const rawBound = fake.created[1];
    const rawPlain = fake.created[2];
    await db.batch([bound, plain]);

    expect(fake.batch).toHaveBeenCalledTimes(1);
    const passed = fake.batch.mock.calls[0]?.[0] ?? [];
    expect(passed[0]).toBe(rawBound);
    expect(passed[1]).toBe(rawPlain);
  });

  it.each(['retry が外側', 'timing が外側'] as const)(
    'd1Timing と重ねても batch は元の statement に届く: %s',
    async (order) => {
      const fake = createFake([]);
      const collector = createD1TimingCollector();
      const db = order === 'retry が外側'
        ? withD1ReadRetry(instrumentD1(fake.db, collector))
        : instrumentD1(withD1ReadRetry(fake.db), collector);

      await db.batch([db.prepare('SELECT 1'), db.prepare('SELECT 2')]);

      expect(fake.batch).toHaveBeenCalledTimes(1);
      const passed = fake.batch.mock.calls[0]?.[0] ?? [];
      expect(passed).toHaveLength(2);
      expect(passed[0]).toBe(fake.created[0]);
      expect(passed[1]).toBe(fake.created[1]);
      expect(collector.snapshot()).toHaveLength(1);
      expect(collector.snapshot()[0]?.statements).toBe(2);
    },
  );
});

describe('isTransientD1Error', () => {
  it.each([
    'Network connection lost',
    'Replica disconnected from primary',
  ])('%s を含むエラーは一時的と判定する', (message) => {
    expect(isTransientD1Error(new Error(`D1_ERROR: ${message}.`))).toBe(true);
  });

  it('SQL のエラーや制約違反は一時的と判定しない', () => {
    expect(isTransientD1Error(syntaxError())).toBe(false);
    expect(isTransientD1Error(new Error('D1_ERROR: D1 DB is overloaded.'))).toBe(false);
    expect(isTransientD1Error(new Error('D1_ERROR: UNIQUE constraint failed: t.id'))).toBe(false);
    expect(isTransientD1Error('Network connection lost')).toBe(true);
    expect(isTransientD1Error(undefined)).toBe(false);
    expect(isTransientD1Error(null)).toBe(false);
  });

  it('cause の message も見る', () => {
    expect(isTransientD1Error(new Error('Failed query', { cause: transient() }))).toBe(true);
    expect(isTransientD1Error(new Error('Failed query', { cause: syntaxError() }))).toBe(false);
  });
});

describe('drizzle 経由の SELECT', () => {
  it('最初の 1 回だけ一時的なエラーになっても、再試行して resolve が成功する', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { sqlite, binding } = createSqliteD1Fixture();
    const sessionId = '00000000-0000-4000-8000-000000000003';
    const userId = '00000000-0000-4000-8000-000000000001';
    sqlite.exec('PRAGMA foreign_keys=OFF');
    sqlite.prepare('INSERT INTO sessions(sessionId,userId,expires) VALUES (?,?,?)').run(
      sessionId,
      userId,
      4_000_000_000_000,
    );

    const used: Method[] = [];
    let failed = false;
    const flaky = {
      prepare: (sql: string) => ({
        bind: (...params: unknown[]) => {
          const bound = binding.prepare(sql).bind(...params) as unknown as Record<Method, () => Promise<unknown>>;
          const guard = (method: Method) => async () => {
            used.push(method);
            if (!failed) {
              failed = true;
              throw new Error('D1_ERROR: Network connection lost.');
            }
            return bound[method]();
          };
          return { all: guard('all'), raw: guard('raw'), run: guard('run'), first: guard('first') };
        },
      }),
    } as unknown as D1Database;
    const sleep = noSleep();
    const { createD1Db } = await import('../adaptor/d1/client.ts');

    const result = await createD1SessionResolver(createD1Db(withD1ReadRetry(flaky, { sleep, random: noJitter })))
      .resolve(
        sessionId as never,
      );

    expect(result.ok && result.val).toEqual({ sessionId, userId, expires: 4_000_000_000_000 });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(used).toEqual(['raw', 'raw']);
    sqlite.close();
  });
});
