import { Result } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import {
  BLUESKY_CROSSPOST_RECENT_FAILURES_LIMIT,
  BlueskyCrosspost,
  MAX_BLUESKY_CROSSPOST_ATTEMPTS,
  MAX_BLUESKY_DELETE_ATTEMPTS,
} from '../../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { createD1BlueskyCrosspostSavedStore } from '../blueskyCrosspost/blueskyCrosspostSavedStore.ts';
import { createD1BlueskyCrosspostStatusReportResolver } from '../blueskyCrosspost/blueskyCrosspostStatusReportResolver.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const at = (minutes: number) => Instant.orThrow(Date.UTC(2026, 10, 8, 0, minutes));
const input = {
  maxAttempts: MAX_BLUESKY_CROSSPOST_ATTEMPTS,
  maxDeleteAttempts: MAX_BLUESKY_DELETE_ATTEMPTS,
  failuresLimit: BLUESKY_CROSSPOST_RECENT_FAILURES_LIMIT,
};
const sentRefs = {
  uri: 'at://did:plc:abc/app.bsky.feed.post/3k1',
  cid: 'bafy',
  rkey: '3k1',
  rootUri: null,
  rootCid: null,
};

const setup = () => {
  const { sqlite, db, queries } = createSqliteD1Fixture();
  return {
    sqlite,
    queries,
    savedStore: createD1BlueskyCrosspostSavedStore(db),
    resolver: createD1BlueskyCrosspostStatusReportResolver(db),
  };
};

const sending = (postId: PostId, minute: number, times: number) => {
  let row = BlueskyCrosspost.pending(postId, at(minute));
  for (let i = 0; i < times; i += 1) row = BlueskyCrosspost.markSending(row, at(minute));
  return row;
};
const failed = (postId: PostId, minute: number, times: number, error = 'error') =>
  BlueskyCrosspost.markFailed(sending(postId, minute, times), error, at(minute));
const deleting = (postId: PostId, minute: number, failures: number, error = 'error') => {
  let row = BlueskyCrosspost.markDeleting(
    BlueskyCrosspost.markSent(sending(postId, minute, 0), sentRefs, at(minute)),
    at(minute),
  );
  for (let i = 0; i < failures; i += 1) row = BlueskyCrosspost.markDeleteFailed(row, error, at(minute));
  return row;
};

describe('D1 の bluesky_crossposts の状態の集計', () => {
  it('行が無いときは、件数がすべて 0 で、失敗は空になる', async () => {
    const { resolver } = setup();

    expect(Result.unsafeUnwrap(await resolver.resolve(input))).toEqual({
      counts: { pending: 0, sent: 0, failed: 0, skipped: 0, deleting: 0 },
      exhausted: { failed: 0, deleting: 0 },
      recentFailures: [],
    });
  });

  it('status ごとの件数と、上限に達した failed と deleting の件数を返す', async () => {
    const { resolver, savedStore } = setup();
    const save = async (row: BlueskyCrosspost) => {
      await savedStore.save(row);
    };
    await save(BlueskyCrosspost.pending(PostId.generate(), at(1)));
    await save(BlueskyCrosspost.pending(PostId.generate(), at(1)));
    await save(BlueskyCrosspost.markSent(sending(PostId.generate(), 2, 0), sentRefs, at(2)));
    await save(BlueskyCrosspost.skipped(PostId.generate(), 'sensitive', at(3)));
    await save(failed(PostId.generate(), 4, MAX_BLUESKY_CROSSPOST_ATTEMPTS - 1));
    await save(failed(PostId.generate(), 5, MAX_BLUESKY_CROSSPOST_ATTEMPTS));
    await save(failed(PostId.generate(), 6, MAX_BLUESKY_CROSSPOST_ATTEMPTS + 1));
    await save(sending(PostId.generate(), 7, MAX_BLUESKY_CROSSPOST_ATTEMPTS));
    await save(deleting(PostId.generate(), 8, MAX_BLUESKY_DELETE_ATTEMPTS - 1));
    await save(deleting(PostId.generate(), 9, MAX_BLUESKY_DELETE_ATTEMPTS));

    const report = Result.unsafeUnwrap(await resolver.resolve(input));

    expect(report.counts).toEqual({ pending: 3, sent: 1, failed: 3, skipped: 1, deleting: 2 });
    expect(report.exhausted).toEqual({ failed: 2, deleting: 1 });
  });

  it('直近の失敗は failed、deleting、attempts が 1 以上の pending だけを updatedAt の降順で返す', async () => {
    const { resolver, savedStore } = setup();
    const [failedId, deletingId, pendingId, freshPendingId, sentId, skippedId] = Array.from(
      { length: 6 },
      () => PostId.generate(),
    ) as [PostId, PostId, PostId, PostId, PostId, PostId];
    await savedStore.save(failed(failedId, 1, 2, 'createRecord failed: status 500'));
    await savedStore.save(deleting(deletingId, 3, 1, 'deleteRecord failed: status 502'));
    await savedStore.save(sending(pendingId, 2, 1));
    await savedStore.save(BlueskyCrosspost.pending(freshPendingId, at(9)));
    await savedStore.save(BlueskyCrosspost.markSent(sending(sentId, 8, 0), sentRefs, at(8)));
    await savedStore.save(BlueskyCrosspost.skipped(skippedId, 'sensitive', at(7)));

    const { recentFailures } = Result.unsafeUnwrap(await resolver.resolve(input));

    expect(recentFailures).toEqual([
      {
        postId: deletingId,
        status: 'deleting',
        attempts: 1,
        lastError: 'deleteRecord failed: status 502',
        updatedAt: at(3),
      },
      { postId: pendingId, status: 'pending', attempts: 1, lastError: null, updatedAt: at(2) },
      {
        postId: failedId,
        status: 'failed',
        attempts: 2,
        lastError: 'createRecord failed: status 500',
        updatedAt: at(1),
      },
    ]);
  });

  it('直近の失敗は limit 件までで、新しいものを残す', async () => {
    const { resolver, savedStore } = setup();
    const ids = Array.from({ length: 12 }, () => PostId.generate());
    for (const [index, postId] of ids.entries()) await savedStore.save(failed(postId, index + 1, 1));

    const { recentFailures, counts } = Result.unsafeUnwrap(await resolver.resolve(input));

    expect(counts.failed).toBe(12);
    expect(recentFailures.map(({ postId }) => postId)).toEqual(ids.slice(2).reverse());
  });

  it('uri、cid、rkey、skipReason を返さない', async () => {
    const { resolver, savedStore } = setup();
    await savedStore.save(deleting(PostId.generate(), 1, 1));

    const { recentFailures } = Result.unsafeUnwrap(await resolver.resolve(input));

    expect(Object.keys(recentFailures[0]!).sort()).toEqual(['attempts', 'lastError', 'postId', 'status', 'updatedAt']);
  });

  it('クエリは件数の集計 1 回と直近の失敗 1 回で、直近の失敗は status の index で絞る', async () => {
    const { resolver, queries, sqlite } = setup();

    await resolver.resolve(input);

    expect(queries).toHaveLength(2);
    expect(queries.filter(({ sql }) => /group by/i.test(sql))).toHaveLength(1);
    const failuresQuery = queries.find(({ sql }) => !/group by/i.test(sql))!;
    const plan = (sqlite.prepare(`EXPLAIN QUERY PLAN ${failuresQuery.sql}`).all(...failuresQuery.params) as Array<
      { detail: string }
    >).map(({ detail }) => detail).join('\n');
    expect(plan).toContain('bluesky_crossposts_status_created_at_idx');
  });
});
