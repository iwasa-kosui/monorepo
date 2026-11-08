import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createD1TimingCollector,
  type D1CallRecord,
  d1TimedRouteOf,
  d1TimingLogLine,
  instrumentD1,
  instrumentEnvD1,
  summarizeD1Calls,
} from './d1Timing.ts';

const call = (startedAt: number, endedAt: number, statements = 1, sqlMs?: number): D1CallRecord => ({
  startedAt,
  endedAt,
  statements,
  sqlMs,
});

describe('summarizeD1Calls', () => {
  it('呼び出しが無いときはすべて 0 にする', () => {
    expect(summarizeD1Calls([])).toEqual({
      calls: 0,
      statements: 0,
      stages: 0,
      busyMs: 0,
      minMs: 0,
      p50Ms: 0,
      maxMs: 0,
      sqlMs: 0,
      sqlKnownCalls: 0,
    });
  });

  it('重なる区間を 1 段に統合し、直列の区間を別の段にする', () => {
    const summary = summarizeD1Calls([call(0, 10), call(5, 20), call(20, 30), call(40, 45)]);
    expect(summary.calls).toBe(4);
    expect(summary.stages).toBe(3);
    expect(summary.busyMs).toBe(20 + 10 + 5);
  });

  it('開始が終了より前の入力順でも同じ結果にする', () => {
    const summary = summarizeD1Calls([call(40, 45), call(20, 30), call(5, 20), call(0, 10)]);
    expect(summary.stages).toBe(3);
    expect(summary.busyMs).toBe(35);
  });

  it('並列の呼び出しは 1 段で、所要時間は呼び出しごとに数える', () => {
    const summary = summarizeD1Calls([call(0, 10), call(0, 4), call(1, 9)]);
    expect(summary.stages).toBe(1);
    expect(summary.busyMs).toBe(10);
    expect(summary.minMs).toBe(4);
    expect(summary.p50Ms).toBe(8);
    expect(summary.maxMs).toBe(10);
  });

  it('batch の中の文の数を足す', () => {
    const summary = summarizeD1Calls([call(0, 5, 3), call(5, 8, 1), call(8, 9, 4)]);
    expect(summary.calls).toBe(3);
    expect(summary.statements).toBe(8);
  });

  it('SQL の実行時間が無い呼び出しは合計にも件数にも入れない', () => {
    const summary = summarizeD1Calls([call(0, 5, 1, 2), call(5, 8, 1, undefined), call(8, 9, 1, 0.5)]);
    expect(summary.sqlMs).toBe(2.5);
    expect(summary.sqlKnownCalls).toBe(2);
  });
});

describe('d1TimedRouteOf', () => {
  it('3 つの POST だけを固定の名前に対応させる', () => {
    expect(d1TimedRouteOf('POST', '/api/v1/statuses')).toBe('statuses_create');
    expect(d1TimedRouteOf('POST', '/api/v1/statuses/abc/favourite')).toBe('favourite');
    expect(d1TimedRouteOf('POST', '/api/v1/statuses/abc/unfavourite')).toBe('unfavourite');
    expect(d1TimedRouteOf('GET', '/api/v1/statuses')).toBeUndefined();
    expect(d1TimedRouteOf('GET', '/api/v1/accounts/verify_credentials')).toBe('verify_credentials');
    expect(d1TimedRouteOf('GET', '/api/v1/timelines/home')).toBe('timelines_home');
    expect(d1TimedRouteOf('GET', '/api/v1/notifications')).toBe('notifications');
    expect(d1TimedRouteOf('GET', '/api/v1/favourites')).toBe('favourites_list');
    expect(d1TimedRouteOf('POST', '/api/v1/notifications')).toBeUndefined();
    expect(d1TimedRouteOf('GET', '/api/v1/notifications/abc')).toBeUndefined();
    expect(d1TimedRouteOf('GET', '/api/v1/timelines/home/')).toBeUndefined();
    expect(d1TimedRouteOf('GET', 'constructor')).toBeUndefined();
    expect(d1TimedRouteOf('POST', '/api/v1/statuses/abc/reblog')).toBeUndefined();
    expect(d1TimedRouteOf('POST', '/api/v1/statuses/a/b/favourite')).toBeUndefined();
  });
});

describe('d1TimingLogLine', () => {
  it('指定のキーだけを固定の文字列と数値で出す', () => {
    const line = d1TimingLogLine('favourite', 200, summarizeD1Calls([call(0, 5, 2, 1)]));
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual([
      'event',
      'route',
      'status',
      'calls',
      'statements',
      'stages',
      'busyMs',
      'minMs',
      'p50Ms',
      'maxMs',
      'sqlMs',
      'sqlKnownCalls',
    ]);
    expect(parsed.event).toBe('d1_timing');
    expect(parsed.route).toBe('favourite');
    for (const [key, value] of Object.entries(parsed)) {
      if (key !== 'event' && key !== 'route') expect(typeof value).toBe('number');
    }
    expect(line).not.toMatch(/https?:|\/api\//);
  });
});

type FakeStatement = D1PreparedStatement & { readonly sql: string; readonly values: ReadonlyArray<unknown> };

const createFakeD1 = () => {
  const result = (duration?: number) => ({
    success: true,
    results: [{ id: 1 }],
    meta: duration === undefined ? {} : { duration },
  });
  const makeStatement = (sql: string, values: ReadonlyArray<unknown>): FakeStatement => {
    const statement = {
      sql,
      values,
      bind: vi.fn((...next: unknown[]) => makeStatement(sql, next)),
      first: vi.fn(async () => ({ id: 1 })),
      all: vi.fn(async () => result(2)),
      run: vi.fn(async () => result(3)),
      raw: vi.fn(async () => [[1]]),
    };
    return statement as unknown as FakeStatement;
  };
  const prepared: FakeStatement[] = [];
  const db = {
    prepare: vi.fn((sql: string) => {
      const statement = makeStatement(sql, []);
      prepared.push(statement);
      return statement;
    }),
    batch: vi.fn(async (statements: ReadonlyArray<unknown>) => statements.map((_s, index) => result(index + 1))),
    exec: vi.fn(async () => ({ count: 1, duration: 4 })),
    dump: vi.fn(async () => new ArrayBuffer(0)),
  };
  return { db, prepared, raw: db as unknown as D1Database };
};

describe('instrumentD1', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('first、all、run、raw の結果をそのまま返し、呼び出しを記録する', async () => {
    const fake = createFakeD1();
    const collector = createD1TimingCollector();
    const db = instrumentD1(fake.raw, collector);

    expect(await db.prepare('select 1').first()).toEqual({ id: 1 });
    expect((await db.prepare('select 2').all()).meta.duration).toBe(2);
    expect((await db.prepare('select 3').run()).meta.duration).toBe(3);
    expect(await db.prepare('select 4').raw()).toEqual([[1]]);

    const calls = collector.snapshot();
    expect(calls.map((entry) => entry.statements)).toEqual([1, 1, 1, 1]);
    expect(calls.map((entry) => entry.sqlMs)).toEqual([undefined, 2, 3, undefined]);
    expect(fake.db.prepare).toHaveBeenCalledTimes(4);
  });

  it('first と raw に渡した引数を元の statement にそのまま渡す', async () => {
    const fake = createFakeD1();
    const db = instrumentD1(fake.raw, createD1TimingCollector());
    await db.prepare('select id').first('id');
    await db.prepare('select id').raw({ columnNames: true });
    expect(fake.prepared[0]!.first).toHaveBeenCalledWith('id');
    expect(fake.prepared[1]!.raw).toHaveBeenCalledWith({ columnNames: true });
  });

  it('bind の連鎖が包んだ statement を返し、元の statement に値を渡す', async () => {
    const fake = createFakeD1();
    const collector = createD1TimingCollector();
    const db = instrumentD1(fake.raw, collector);

    const bound = db.prepare('select ?').bind(1).bind(2, 3);
    expect(fake.prepared[0]!.bind).toHaveBeenCalledWith(1);
    await bound.all();

    expect(collector.snapshot()).toHaveLength(1);
  });

  it('batch は元の statement を受け取り、文の数と meta.duration の合計を記録する', async () => {
    const fake = createFakeD1();
    const collector = createD1TimingCollector();
    const db = instrumentD1(fake.raw, collector);

    const first = db.prepare('insert 1').bind(1);
    const second = db.prepare('insert 2');
    const results = await db.batch([first, second]);

    const passed = fake.db.batch.mock.calls[0]![0] as ReadonlyArray<FakeStatement>;
    expect(passed.map((statement) => statement.sql)).toEqual(['insert 1', 'insert 2']);
    expect(passed[0]).not.toBe(first);
    expect(passed[0]!.values).toEqual([1]);
    expect(passed[1]).toBe(fake.prepared[1]);
    expect(results).toHaveLength(2);
    expect(collector.snapshot()).toEqual([
      expect.objectContaining({ statements: 2, sqlMs: 3 }),
    ]);
  });

  it('exec の結果をそのまま返す', async () => {
    const fake = createFakeD1();
    const collector = createD1TimingCollector();
    const db = instrumentD1(fake.raw, collector);

    expect(await db.exec('select 1')).toEqual({ count: 1, duration: 4 });
    expect(collector.snapshot()).toEqual([expect.objectContaining({ statements: 1, sqlMs: 4 })]);
  });

  it('それ以外のメソッドは元の binding を this にして呼ぶ', async () => {
    const fake = createFakeD1();
    const db = instrumentD1(fake.raw, createD1TimingCollector());
    await db.dump();
    expect(fake.db.dump).toHaveBeenCalledTimes(1);
    expect(fake.db.dump.mock.contexts[0]).toBe(fake.db);
  });

  it('失敗した呼び出しも記録し、同じ例外を投げ直す', async () => {
    const fake = createFakeD1();
    const failure = new Error('D1_ERROR');
    fake.db.batch.mockRejectedValueOnce(failure);
    const collector = createD1TimingCollector();
    const db = instrumentD1(fake.raw, collector);
    const statement = db.prepare('select 1');
    vi.mocked(fake.prepared[0]!.all).mockRejectedValueOnce(failure);

    await expect(statement.all()).rejects.toBe(failure);
    await expect(db.batch([statement, db.prepare('select 2')])).rejects.toBe(failure);

    expect(collector.snapshot()).toEqual([
      expect.objectContaining({ statements: 1, sqlMs: undefined }),
      expect.objectContaining({ statements: 2, sqlMs: undefined }),
    ]);
  });

  it('開始と終了の Date.now() を記録する', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const fake = createFakeD1();
    const collector = createD1TimingCollector();
    const db = instrumentD1(fake.raw, collector);
    const statement = db.prepare('select 1');
    vi.mocked(fake.prepared[0]!.all).mockImplementationOnce(async () => {
      vi.setSystemTime(1007);
      return { success: true, results: [], meta: { duration: 5 } } as never;
    });

    await statement.all();

    expect(collector.snapshot()).toEqual([{ startedAt: 1000, endedAt: 1007, statements: 1, sqlMs: 5 }]);
  });

  it('記録に失敗しても元の結果を返す', async () => {
    const fake = createFakeD1();
    const collector = {
      record: () => {
        throw new Error('record failed');
      },
      snapshot: () => [],
    };
    const db = instrumentD1(fake.raw, collector);
    expect(await db.prepare('select 1').first()).toEqual({ id: 1 });
  });
});

describe('instrumentEnvD1', () => {
  it('DB が無い env はそのまま返す', () => {
    const env = { ORIGIN: 'https://worker.test' } as never;
    expect(instrumentEnvD1(env, createD1TimingCollector())).toBe(env);
  });

  it('DB だけを差し替える', () => {
    const fake = createFakeD1();
    const env = { DB: fake.raw, ORIGIN: 'https://worker.test' };
    const wrapped = instrumentEnvD1(env, createD1TimingCollector());
    expect(wrapped.ORIGIN).toBe('https://worker.test');
    expect(wrapped.DB).not.toBe(fake.raw);
  });
});
