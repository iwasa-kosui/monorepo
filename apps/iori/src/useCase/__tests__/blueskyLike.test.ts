import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1BlueskyLikeDeletedStore } from '../../adaptor/d1/blueskyTimeline/blueskyLikeDeletedStore.ts';
import { createD1BlueskyLikeSavedStore } from '../../adaptor/d1/blueskyTimeline/blueskyLikeSavedStore.ts';
import { createD1BlueskyLikeTargetResolver } from '../../adaptor/d1/blueskyTimeline/blueskyLikeTargetResolver.ts';
import { deriveBlueskyLikeRkey } from '../../domain/blueskyTimeline/blueskyLike.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyClient, BlueskyClientError } from '../../ports/blueskyClient.ts';
import { LikeBlueskyPostUseCase } from '../likeBlueskyPost.ts';
import { UnlikeBlueskyPostUseCase } from '../unlikeBlueskyPost.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 8, 12));
const POST = 'at://did:plc:a/app.bsky.feed.post/1';
const REPOST = `${POST}#repost:did:plc:b`;
const LIKE = 'at://did:plc:me/app.bsky.feed.like/3kold';
const CREATED = 'at://did:plc:me/app.bsky.feed.like/3knew';
const failure: BlueskyClientError = {
  type: 'BlueskyClientError',
  kind: 'http',
  message: 'createRecord failed: status 500',
  status: 500,
};

const setup = () => {
  const { db, sqlite, queries } = createSqliteD1Fixture();
  const insertItem = sqlite.prepare(
    'INSERT INTO bluesky_timeline_items(feedItemId,uri,cid,authorDid,authorHandle,text,facets,repostedByDid,postedAt,indexedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  );
  insertItem.run(POST, POST, 'bafypost', 'did:plc:a', 'alice.bsky.social', 't', '[]', null, 1, 1, 1);
  insertItem.run(REPOST, POST, 'bafypost', 'did:plc:a', 'alice.bsky.social', 't', '[]', 'did:plc:b', 1, 1, 1);
  const createLike = vi.fn<BlueskyClient['createLike']>(async () => RA.ok({ uri: CREATED }));
  const deleteLike = vi.fn<BlueskyClient['deleteLike']>(async () => RA.ok(undefined));
  const targetResolver = createD1BlueskyLikeTargetResolver(db);
  const save = vi.fn(createD1BlueskyLikeSavedStore(db).save);
  const like = LikeBlueskyPostUseCase.create({
    client: { createLike },
    targetResolver,
    savedStore: { save },
    now: () => NOW,
  });
  const unlike = UnlikeBlueskyPostUseCase.create({
    client: { deleteLike },
    targetResolver,
    deletedStore: createD1BlueskyLikeDeletedStore(db),
  });
  const likes = () => sqlite.prepare('SELECT subjectUri, likeUri, createdAt FROM bluesky_likes').all();
  const seedLike = () =>
    sqlite.prepare('INSERT INTO bluesky_likes(subjectUri,likeUri,createdAt) VALUES (?,?,?)').run(POST, LIKE, 1);
  return { like, unlike, createLike, deleteLike, save, likes, seedLike, queries };
};

describe('LikeBlueskyPostUseCase', () => {
  it('未知の feedItemId は NotFound にし、Bluesky を呼ばない', async () => {
    const t = setup();

    const result = await t.like.run({ feedItemId: 'unknown' });

    expect(result).toEqual({ ok: false, err: { type: 'BlueskyLikeTargetNotFound' } });
    expect(t.createLike).not.toHaveBeenCalled();
  });

  it('投稿の uri と cid を行から取って Bluesky に作成し、成功してから bluesky_likes に保存する', async () => {
    const t = setup();

    const result = await t.like.run({ feedItemId: POST });

    expect(result).toEqual({ ok: true, val: { liked: true } });
    expect(t.createLike).toHaveBeenCalledExactlyOnceWith(
      { uri: POST, cid: 'bafypost' },
      await deriveBlueskyLikeRkey(POST),
    );
    expect(t.likes()).toEqual([{ subjectUri: POST, likeUri: CREATED, createdAt: NOW }]);
  });

  it('D1 には、行の取得 1 回と、保存の INSERT 1 回だけを発行する', async () => {
    const t = setup();
    t.queries.length = 0;

    await t.like.run({ feedItemId: POST });

    expect(t.queries.map(({ sql }) => sql.trim().split(/\s/)[0]?.toLowerCase())).toEqual(['select', 'insert']);
  });

  it('repost の行からでも元の投稿の uri にいいねを保存する', async () => {
    const t = setup();

    await t.like.run({ feedItemId: REPOST });

    expect(t.createLike).toHaveBeenCalledExactlyOnceWith(
      { uri: POST, cid: 'bafypost' },
      await deriveBlueskyLikeRkey(POST),
    );
    expect(t.likes()).toEqual([{ subjectUri: POST, likeUri: CREATED, createdAt: NOW }]);
  });

  it('いいね済みなら Bluesky を呼ばず、成功を返し、行も変えない', async () => {
    const t = setup();
    t.seedLike();

    const result = await t.like.run({ feedItemId: REPOST });

    expect(result).toEqual({ ok: true, val: { liked: true } });
    expect(t.createLike).not.toHaveBeenCalled();
    expect(t.likes()).toEqual([{ subjectUri: POST, likeUri: LIKE, createdAt: 1 }]);
  });

  it('保存が失敗したあとに押し直しても、同じ rkey で Bluesky に書き込む', async () => {
    const t = setup();
    t.save.mockRejectedValueOnce(new Error('D1 is unavailable'));

    await expect(t.like.run({ feedItemId: POST })).rejects.toThrow('D1 is unavailable');
    const retried = await t.like.run({ feedItemId: POST });

    expect(retried).toEqual({ ok: true, val: { liked: true } });
    expect(t.createLike).toHaveBeenCalledTimes(2);
    expect(t.createLike.mock.calls[1]?.[1]).toBe(t.createLike.mock.calls[0]?.[1]);
    expect(t.likes()).toEqual([{ subjectUri: POST, likeUri: CREATED, createdAt: NOW }]);
  });

  it('同時に 2 回実行しても、同じ rkey で Bluesky に書き込み、行は 1 つになる', async () => {
    const t = setup();

    await Promise.all([t.like.run({ feedItemId: POST }), t.like.run({ feedItemId: REPOST })]);

    expect(t.createLike).toHaveBeenCalledTimes(2);
    expect(t.createLike.mock.calls[1]?.[1]).toBe(t.createLike.mock.calls[0]?.[1]);
    expect(t.likes()).toEqual([{ subjectUri: POST, likeUri: CREATED, createdAt: NOW }]);
  });

  it('Bluesky の作成が失敗したら、エラーを返し、保存しない', async () => {
    const t = setup();
    t.createLike.mockReturnValueOnce(RA.err(failure));

    const result = await t.like.run({ feedItemId: POST });

    expect(result).toEqual({ ok: false, err: failure });
    expect(t.likes()).toEqual([]);
  });
});

describe('UnlikeBlueskyPostUseCase', () => {
  it('未知の feedItemId は NotFound にし、Bluesky を呼ばない', async () => {
    const t = setup();

    const result = await t.unlike.run({ feedItemId: 'unknown' });

    expect(result).toEqual({ ok: false, err: { type: 'BlueskyLikeTargetNotFound' } });
    expect(t.deleteLike).not.toHaveBeenCalled();
  });

  it('行がなければ Bluesky を呼ばず、成功を返す', async () => {
    const t = setup();

    const result = await t.unlike.run({ feedItemId: POST });

    expect(result).toEqual({ ok: true, val: { liked: false } });
    expect(t.deleteLike).not.toHaveBeenCalled();
  });

  it('D1 には、行の取得 1 回と、削除の DELETE 1 回だけを発行する', async () => {
    const t = setup();
    t.seedLike();
    t.queries.length = 0;

    await t.unlike.run({ feedItemId: POST });

    expect(t.queries.map(({ sql }) => sql.trim().split(/\s/)[0]?.toLowerCase())).toEqual(['select', 'delete']);
  });

  it('likeUri の rkey で削除し、成功してから行を消す', async () => {
    const t = setup();
    t.seedLike();

    const result = await t.unlike.run({ feedItemId: REPOST });

    expect(result).toEqual({ ok: true, val: { liked: false } });
    expect(t.deleteLike).toHaveBeenCalledExactlyOnceWith('3kold');
    expect(t.likes()).toEqual([]);
  });

  it('Bluesky の削除が失敗したら、エラーを返し、行を消さない', async () => {
    const t = setup();
    t.seedLike();
    t.deleteLike.mockReturnValueOnce(RA.err(failure));

    const result = await t.unlike.run({ feedItemId: POST });

    expect(result).toEqual({ ok: false, err: failure });
    expect(t.likes()).toEqual([{ subjectUri: POST, likeUri: LIKE, createdAt: 1 }]);
  });
});
