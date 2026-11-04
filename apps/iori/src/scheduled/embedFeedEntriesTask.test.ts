import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSqliteD1Fixture } from '../adaptor/d1/__tests__/sqliteFixture.ts';
import { embedFeedEntriesTask } from './feedTasks.ts';
import { type ScheduledTaskContext, scheduledTasks } from './scheduledTasks.ts';

const FEED_SOURCE_ID = '00000000-0000-4000-8000-0000000000f1';

const setup = (ai: unknown) => {
  const { sqlite, binding } = createSqliteD1Fixture();
  sqlite.prepare('INSERT INTO feed_sources(feedSourceId,kind,url,title,enabled,createdAt) VALUES (?,?,?,?,?,?)')
    .run(FEED_SOURCE_ID, 'rss', 'https://feeds.example/a', 'feed', 1, 1_000);
  for (let n = 1; n <= 2; n += 1) {
    sqlite.prepare(
      'INSERT INTO feed_entries(feedEntryId,feedSourceId,guid,url,title,description,fetchedAt) VALUES (?,?,?,?,?,?,?)',
    ).run(
      `00000000-0000-4000-8000-00000000000${n}`,
      FEED_SOURCE_ID,
      `g${n}`,
      `https://example.com/${n}`,
      't',
      'd',
      Date.now(),
    );
  }
  const context = {
    env: { DB: binding, AI: ai },
    scheduledTime: new Date(),
    waitUntil: () => undefined,
  } as unknown as ScheduledTaskContext;
  return { sqlite, context };
};

afterEach(() => vi.restoreAllMocks());

describe('embedFeedEntriesTask', () => {
  it('3 時間ごとの cron に登録されている', () => {
    expect(scheduledTasks['0 0,3,6,9,12,15,18,21 * * *']).toContain(embedFeedEntriesTask);
  });

  it('記事を埋め込み、件数をログに出す', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const run = vi.fn(async (_model: string, inputs: Record<string, unknown>) => ({
      data: (inputs['text'] as string[]).map(() => Array.from({ length: 1024 }, () => 1)),
    }));
    const { sqlite, context } = setup({ run });

    await embedFeedEntriesTask.run(context);

    expect(run).toHaveBeenCalledWith('@cf/baai/bge-m3', { text: ['t\nd', 't\nd'] });
    expect(sqlite.prepare('SELECT count(*) AS n FROM feed_entries WHERE embeddedAt IS NOT NULL').get()).toEqual({
      n: 2,
    });
    expect(info).toHaveBeenCalledWith('iori feed entries embedded.', { embedded: 2, skipped: 0 });
  });

  it('env.AI が無ければ飛ばす', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { sqlite, context } = setup(undefined);

    await embedFeedEntriesTask.run(context);

    expect(sqlite.prepare('SELECT count(*) AS n FROM feed_entries WHERE embeddedAt IS NOT NULL').get()).toEqual({
      n: 0,
    });
    expect(info).toHaveBeenCalledWith('iori feed entries embedded.', { embedded: 0, skipped: 0 });
  });

  it('埋め込みがすべて失敗したら投げる', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { context } = setup({ run: async () => Promise.reject(new Error('unavailable')) });

    await expect(embedFeedEntriesTask.run(context)).rejects.toThrow('unavailable');
  });
});
