import { env } from 'cloudflare:test';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { createD1Db } from '../src/adaptor/d1/client.ts';
import { createD1TimingCollector, instrumentD1 } from '../src/runtime/d1Timing.ts';

describe('instrumentD1 on workerd D1', () => {
  it('drizzle が呼ぶ all、run、raw、batch を記録し、結果を変えない', async () => {
    const collector = createD1TimingCollector();
    const db = createD1Db(instrumentD1(env.DB, collector));

    const all = await db.all<{ n: number }>(sql`SELECT 1 AS n`);
    const run = await db.run(sql`SELECT 1`);
    const [batched] = await db.batch([db.run(sql`SELECT 1`), db.run(sql`SELECT 2`)]);

    expect(all).toEqual([{ n: 1 }]);
    expect(run.success).toBe(true);
    expect(batched.success).toBe(true);
    const calls = collector.snapshot();
    expect(calls.map((call) => call.statements)).toEqual([1, 1, 2]);
    expect(calls.every((call) => call.endedAt >= call.startedAt)).toBe(true);
  });

  it('raw は meta.duration を返さないので SQL の実行時間を記録しない', async () => {
    const collector = createD1TimingCollector();
    const raw = await instrumentD1(env.DB, collector).prepare('SELECT 1 AS n').raw();

    expect(raw).toEqual([[1]]);
    expect(collector.snapshot().map((call) => call.sqlMs)).toEqual([undefined]);
  });
});
