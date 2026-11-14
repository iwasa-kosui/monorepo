import { Result } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { BlueskyCrosspost, type BlueskySession } from '../../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { createD1BlueskyCrosspostDeletedStore } from '../blueskyCrosspost/blueskyCrosspostDeletedStore.ts';
import { createD1BlueskyCrosspostResolver } from '../blueskyCrosspost/blueskyCrosspostResolver.ts';
import { createD1BlueskyCrosspostSavedStore } from '../blueskyCrosspost/blueskyCrosspostSavedStore.ts';
import { createD1BlueskyCrosspostsResolverByRetryable } from '../blueskyCrosspost/blueskyCrosspostsResolverByRetryable.ts';
import {
  BLUESKY_SESSION_ID,
  createD1BlueskySessionResolver,
  createD1BlueskySessionSavedStore,
} from '../blueskyCrosspost/blueskySessionStore.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const at = (minutes: number) => Instant.orThrow(Date.UTC(2026, 10, 8, 0, minutes));

const setup = () => {
  const { sqlite, db } = createSqliteD1Fixture();
  return {
    sqlite,
    resolver: createD1BlueskyCrosspostResolver(db),
    savedStore: createD1BlueskyCrosspostSavedStore(db),
    deletedStore: createD1BlueskyCrosspostDeletedStore(db),
    retryable: createD1BlueskyCrosspostsResolverByRetryable(db),
    sessionResolver: createD1BlueskySessionResolver(db),
    sessionStore: createD1BlueskySessionSavedStore(db),
  };
};

describe('D1 の bluesky_crossposts アダプタ', () => {
  it('同じ postId への保存は更新になり、createdAt を変えない', async () => {
    const { resolver, savedStore, sqlite } = setup();
    const postId = PostId.generate();
    const pending = BlueskyCrosspost.pending(postId, at(1));
    await savedStore.save(pending);

    await savedStore.save(
      BlueskyCrosspost.markSent(pending, {
        uri: 'at://did:plc:abc/app.bsky.feed.post/3k1',
        cid: 'bafy',
        rkey: '3k1',
        rootUri: 'at://did:plc:abc/app.bsky.feed.post/root',
        rootCid: 'bafyroot',
      }, at(5)),
    );

    expect(Result.unsafeUnwrap(await resolver.resolve(postId))).toEqual({
      postId,
      status: 'sent',
      skipReason: null,
      uri: 'at://did:plc:abc/app.bsky.feed.post/3k1',
      cid: 'bafy',
      rkey: '3k1',
      rootUri: 'at://did:plc:abc/app.bsky.feed.post/root',
      rootCid: 'bafyroot',
      attempts: 0,
      lastError: null,
      createdAt: at(1),
      updatedAt: at(5),
    });
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM bluesky_crossposts').get()).toEqual({ n: 1 });
  });

  it('update は既にある行だけを更新して true を返し、無い行は作らず false を返す', async () => {
    const { resolver, savedStore, deletedStore } = setup();
    const postId = PostId.generate();
    const pending = BlueskyCrosspost.pending(postId, at(1));
    await savedStore.save(pending);

    expect(Result.unsafeUnwrap(await savedStore.update(BlueskyCrosspost.markSending(pending, at(2))))).toBe(true);
    expect(Result.unsafeUnwrap(await resolver.resolve(postId))).toMatchObject({
      status: 'pending',
      attempts: 1,
      createdAt: at(1),
      updatedAt: at(2),
    });

    await deletedStore.delete(postId);

    expect(Result.unsafeUnwrap(await savedStore.update(BlueskyCrosspost.markSending(pending, at(3))))).toBe(false);
    expect(Result.unsafeUnwrap(await resolver.resolve(postId))).toBeUndefined();
  });

  it('再送の候補は、10 分以上前の pending、上限未満の failed、上限未満の deleting を古い順に limit 件返す', async () => {
    const { savedStore, retryable } = setup();
    const ids = Array.from({ length: 11 }, () => PostId.generate());
    const [
      oldPending,
      freshPending,
      failedOne,
      failedThree,
      sent,
      skipped,
      failedOld,
      failedTwo,
      exhaustedPending,
      deletingFour,
      deletingFive,
    ] = ids as [PostId, PostId, PostId, PostId, PostId, PostId, PostId, PostId, PostId, PostId, PostId];
    const pending = (postId: PostId, minute: number, times = 0) => {
      let row = BlueskyCrosspost.pending(postId, at(minute));
      for (let i = 0; i < times; i += 1) row = BlueskyCrosspost.markSending(row, at(minute + 1));
      return row;
    };
    const failed = (postId: PostId, minute: number, times: number) =>
      BlueskyCrosspost.markFailed(pending(postId, minute, times), 'error', at(minute + 1));
    const sentRefs = { uri: 'u', cid: 'c', rkey: 'r', rootUri: null, rootCid: null };
    const deleting = (postId: PostId, minute: number, times: number) => {
      let row = BlueskyCrosspost.markDeleting(
        BlueskyCrosspost.markSent(pending(postId, minute), sentRefs, at(minute)),
        at(minute),
      );
      for (let i = 0; i < times; i += 1) row = BlueskyCrosspost.markDeleteFailed(row, 'error', at(minute + 1));
      return row;
    };
    await savedStore.save(pending(oldPending, 2));
    await savedStore.save(pending(freshPending, 55));
    await savedStore.save(failed(failedOne, 3, 1));
    await savedStore.save(failed(failedThree, 4, 3));
    await savedStore.save(BlueskyCrosspost.markSent(pending(sent, 5), sentRefs, at(6)));
    await savedStore.save(BlueskyCrosspost.skipped(skipped, 'sensitive', at(7)));
    await savedStore.save(failed(failedOld, 1, 2));
    await savedStore.save(failed(failedTwo, 8, 2));
    await savedStore.save(pending(exhaustedPending, 9, 3));
    await savedStore.save(deleting(deletingFour, 10, 4));
    await savedStore.save(deleting(deletingFive, 11, 5));

    const all = Result.unsafeUnwrap(
      await retryable.resolve({ pendingCreatedBefore: at(50), maxAttempts: 3, maxDeleteAttempts: 5, limit: 20 }),
    );
    expect(all.map((row) => row.postId)).toEqual([failedOld, oldPending, failedOne, failedTwo, deletingFour]);

    const limited = Result.unsafeUnwrap(
      await retryable.resolve({ pendingCreatedBefore: at(50), maxAttempts: 3, maxDeleteAttempts: 5, limit: 2 }),
    );
    expect(limited.map((row) => row.postId)).toEqual([failedOld, oldPending]);
  });

  it('deleting の行は uri、cid、rkey と試行回数、lastError を保存し直せる', async () => {
    const { resolver, savedStore } = setup();
    const postId = PostId.generate();
    const sentRow = BlueskyCrosspost.markSent(BlueskyCrosspost.pending(postId, at(1)), {
      uri: 'at://did:plc:abc/app.bsky.feed.post/3k1',
      cid: 'bafy',
      rkey: '3k1',
      rootUri: null,
      rootCid: null,
    }, at(2));

    await savedStore.save(sentRow);
    await savedStore.save(
      BlueskyCrosspost.markDeleteFailed(BlueskyCrosspost.markDeleting(sentRow, at(3)), 'deleteRecord failed', at(4)),
    );

    expect(Result.unsafeUnwrap(await resolver.resolve(postId))).toMatchObject({
      status: 'deleting',
      uri: 'at://did:plc:abc/app.bsky.feed.post/3k1',
      cid: 'bafy',
      rkey: '3k1',
      attempts: 1,
      lastError: 'deleteRecord failed',
    });
  });
});

describe('D1 の bluesky_sessions アダプタ', () => {
  const session = (suffix: string, minute: number): BlueskySession => ({
    did: 'did:plc:abc',
    handle: 'iori.example.com',
    pdsUrl: 'https://pds.example.net',
    accessJwt: `access-${suffix}`,
    refreshJwt: `refresh-${suffix}`,
    updatedAt: at(minute),
  });

  it('固定の id で 1 行だけ保持し、保存し直すと置き換える', async () => {
    const { sessionResolver, sessionStore, sqlite } = setup();

    await sessionStore.save(session('a', 1));
    await sessionStore.save(session('b', 2));

    expect(Result.unsafeUnwrap(await sessionResolver.resolve())).toEqual(session('b', 2));
    expect(sqlite.prepare('SELECT id FROM bluesky_sessions').all()).toEqual([{ id: BLUESKY_SESSION_ID }]);
    expect(BLUESKY_SESSION_ID).toBe('default');
  });
});
