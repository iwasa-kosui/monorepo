import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1BlueskyRepostDeletedStore } from '../../adaptor/d1/blueskyTimeline/blueskyRepostDeletedStore.ts';
import { createD1BlueskyRepostSavedStore } from '../../adaptor/d1/blueskyTimeline/blueskyRepostSavedStore.ts';
import { createD1BlueskyRepostTargetResolver } from '../../adaptor/d1/blueskyTimeline/blueskyRepostTargetResolver.ts';
import { deriveBlueskyRepostRkey } from '../../domain/blueskyTimeline/blueskyRepost.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyClient, BlueskyClientError } from '../../ports/blueskyClient.ts';
import type { BlueskyViewerRepostResolver } from '../../ports/blueskyViewerRepostResolver.ts';
import { RepostBlueskyPostUseCase } from '../repostBlueskyPost.ts';
import { UndoRepostBlueskyPostUseCase } from '../undoRepostBlueskyPost.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 8, 12));
const POST = 'at://did:plc:a/app.bsky.feed.post/1';
const REPOST_ROW = `${POST}#repost:did:plc:b`;
const REPOST = 'at://did:plc:me/app.bsky.feed.repost/3kold';
const CREATED = 'at://did:plc:me/app.bsky.feed.repost/3knew';
const failure: BlueskyClientError = {
  type: 'BlueskyClientError',
  kind: 'http',
  message: 'putRecord failed: status 500',
  status: 500,
};

const setup = () => {
  const { db, sqlite, queries } = createSqliteD1Fixture();
  const insertItem = sqlite.prepare(
    'INSERT INTO bluesky_timeline_items(feedItemId,uri,cid,authorDid,authorHandle,text,facets,repostedByDid,postedAt,indexedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  );
  insertItem.run(POST, POST, 'bafypost', 'did:plc:a', 'alice.bsky.social', 't', '[]', null, 1, 1, 1);
  insertItem.run(REPOST_ROW, POST, 'bafypost', 'did:plc:a', 'alice.bsky.social', 't', '[]', 'did:plc:b', 1, 1, 1);
  const createRepost = vi.fn<BlueskyClient['createRepost']>(async () => RA.ok({ uri: CREATED }));
  const deleteRepost = vi.fn<BlueskyClient['deleteRepost']>(async () => RA.ok(undefined));
  const resolveViewerRepost = vi.fn<BlueskyViewerRepostResolver['resolve']>(async () => RA.ok(null));
  const targetResolver = createD1BlueskyRepostTargetResolver(db);
  const save = vi.fn(createD1BlueskyRepostSavedStore(db).save);
  const repost = RepostBlueskyPostUseCase.create({
    client: { createRepost },
    targetResolver,
    viewerRepostResolver: { resolve: resolveViewerRepost },
    savedStore: { save },
    now: () => NOW,
  });
  const undoRepost = UndoRepostBlueskyPostUseCase.create({
    client: { deleteRepost },
    targetResolver,
    deletedStore: createD1BlueskyRepostDeletedStore(db),
  });
  const reposts = () => sqlite.prepare('SELECT subjectUri, repostUri, createdAt FROM bluesky_reposts').all();
  const seedRepost = (repostUri = REPOST) =>
    sqlite.prepare('INSERT INTO bluesky_reposts(subjectUri,repostUri,createdAt) VALUES (?,?,?)').run(
      POST,
      repostUri,
      1,
    );
  return { repost, undoRepost, createRepost, deleteRepost, resolveViewerRepost, save, reposts, seedRepost, queries };
};

describe('RepostBlueskyPostUseCase', () => {
  it('未知の feedItemId は NotFound にし、Bluesky を呼ばない', async () => {
    const t = setup();

    const result = await t.repost.run({ feedItemId: 'unknown' });

    expect(result).toEqual({ ok: false, err: { type: 'BlueskyRepostTargetNotFound' } });
    expect(t.createRepost).not.toHaveBeenCalled();
  });

  it('投稿の uri と cid を行から取って Bluesky に作成し、成功してから bluesky_reposts に保存する', async () => {
    const t = setup();

    const result = await t.repost.run({ feedItemId: POST });

    expect(result).toEqual({ ok: true, val: { reposted: true } });
    expect(t.createRepost).toHaveBeenCalledExactlyOnceWith(
      { uri: POST, cid: 'bafypost' },
      await deriveBlueskyRepostRkey(POST),
    );
    expect(t.reposts()).toEqual([{ subjectUri: POST, repostUri: CREATED, createdAt: NOW }]);
  });

  it('D1 には、行の取得 1 回と、保存の INSERT 1 回だけを発行する', async () => {
    const t = setup();
    t.queries.length = 0;

    await t.repost.run({ feedItemId: POST });

    expect(t.queries.map(({ sql }) => sql.trim().split(/\s/)[0]?.toLowerCase())).toEqual(['select', 'insert']);
  });

  it('リポストの行からでも元の投稿の uri にリポストを保存する', async () => {
    const t = setup();

    await t.repost.run({ feedItemId: REPOST_ROW });

    expect(t.createRepost).toHaveBeenCalledExactlyOnceWith(
      { uri: POST, cid: 'bafypost' },
      await deriveBlueskyRepostRkey(POST),
    );
    expect(t.reposts()).toEqual([{ subjectUri: POST, repostUri: CREATED, createdAt: NOW }]);
  });

  it('リポスト済みなら Bluesky を呼ばず、成功を返し、行も変えない', async () => {
    const t = setup();
    t.seedRepost();

    const result = await t.repost.run({ feedItemId: REPOST_ROW });

    expect(result).toEqual({ ok: true, val: { reposted: true } });
    expect(t.createRepost).not.toHaveBeenCalled();
    expect(t.reposts()).toEqual([{ subjectUri: POST, repostUri: REPOST, createdAt: 1 }]);
  });

  it('保存が失敗したあとに押し直しても、同じ rkey で Bluesky に書き込む', async () => {
    const t = setup();
    t.save.mockRejectedValueOnce(new Error('D1 is unavailable'));

    await expect(t.repost.run({ feedItemId: POST })).rejects.toThrow('D1 is unavailable');
    const retried = await t.repost.run({ feedItemId: POST });

    expect(retried).toEqual({ ok: true, val: { reposted: true } });
    expect(t.createRepost).toHaveBeenCalledTimes(2);
    expect(t.createRepost.mock.calls[1]?.[1]).toBe(t.createRepost.mock.calls[0]?.[1]);
    expect(t.reposts()).toEqual([{ subjectUri: POST, repostUri: CREATED, createdAt: NOW }]);
  });

  it('同時に 2 回実行しても、同じ rkey で Bluesky に書き込み、行は 1 つになる', async () => {
    const t = setup();

    await Promise.all([t.repost.run({ feedItemId: POST }), t.repost.run({ feedItemId: REPOST_ROW })]);

    expect(t.createRepost).toHaveBeenCalledTimes(2);
    expect(t.createRepost.mock.calls[1]?.[1]).toBe(t.createRepost.mock.calls[0]?.[1]);
    expect(t.reposts()).toEqual([{ subjectUri: POST, repostUri: CREATED, createdAt: NOW }]);
  });

  it('投稿の uri で viewer.repost を確かめてから作成する', async () => {
    const t = setup();

    await t.repost.run({ feedItemId: REPOST_ROW });

    expect(t.resolveViewerRepost).toHaveBeenCalledExactlyOnceWith(POST);
  });

  it('別クライアントで作成済みの viewer.repost があれば、Bluesky に作成せず、その uri を保存する', async () => {
    const t = setup();
    t.resolveViewerRepost.mockReturnValueOnce(RA.ok(REPOST));

    const result = await t.repost.run({ feedItemId: POST });

    expect(result).toEqual({ ok: true, val: { reposted: true } });
    expect(t.createRepost).not.toHaveBeenCalled();
    expect(t.reposts()).toEqual([{ subjectUri: POST, repostUri: REPOST, createdAt: NOW }]);
  });

  it('viewer.repost の確認が失敗したら、エラーを返し、Bluesky に作成せず、保存しない', async () => {
    const t = setup();
    t.resolveViewerRepost.mockReturnValueOnce(RA.err(failure));

    const result = await t.repost.run({ feedItemId: POST });

    expect(result).toEqual({ ok: false, err: failure });
    expect(t.createRepost).not.toHaveBeenCalled();
    expect(t.reposts()).toEqual([]);
  });

  it('リポスト済みなら viewer.repost を確かめない', async () => {
    const t = setup();
    t.seedRepost();

    await t.repost.run({ feedItemId: POST });

    expect(t.resolveViewerRepost).not.toHaveBeenCalled();
  });

  it('Bluesky の作成が失敗したら、エラーを返し、保存しない', async () => {
    const t = setup();
    t.createRepost.mockReturnValueOnce(RA.err(failure));

    const result = await t.repost.run({ feedItemId: POST });

    expect(result).toEqual({ ok: false, err: failure });
    expect(t.reposts()).toEqual([]);
  });
});

describe('UndoRepostBlueskyPostUseCase', () => {
  it('未知の feedItemId は NotFound にし、Bluesky を呼ばない', async () => {
    const t = setup();

    const result = await t.undoRepost.run({ feedItemId: 'unknown' });

    expect(result).toEqual({ ok: false, err: { type: 'BlueskyRepostTargetNotFound' } });
    expect(t.deleteRepost).not.toHaveBeenCalled();
  });

  it('行がなければ Bluesky を呼ばず、成功を返す', async () => {
    const t = setup();

    const result = await t.undoRepost.run({ feedItemId: POST });

    expect(result).toEqual({ ok: true, val: { reposted: false } });
    expect(t.deleteRepost).not.toHaveBeenCalled();
  });

  it('D1 には、行の取得 1 回と、削除の DELETE 1 回だけを発行する', async () => {
    const t = setup();
    t.seedRepost();
    t.queries.length = 0;

    await t.undoRepost.run({ feedItemId: POST });

    expect(t.queries.map(({ sql }) => sql.trim().split(/\s/)[0]?.toLowerCase())).toEqual(['select', 'delete']);
  });

  it('repostUri の rkey で削除し、成功してから行を消す', async () => {
    const t = setup();
    t.seedRepost();

    const result = await t.undoRepost.run({ feedItemId: REPOST_ROW });

    expect(result).toEqual({ ok: true, val: { reposted: false } });
    expect(t.deleteRepost).toHaveBeenCalledExactlyOnceWith('3kold');
    expect(t.reposts()).toEqual([]);
  });

  it('保存された repostUri が repost の形でなければ、Bluesky を呼ばずエラーにし、行を消さない', async () => {
    const t = setup();
    t.seedRepost('at://did:plc:me/app.bsky.feed.like/3kold');

    const result = await t.undoRepost.run({ feedItemId: POST });

    expect(result).toEqual({
      ok: false,
      err: { type: 'BlueskyClientError', kind: 'invalid_response', message: 'stored repost uri is invalid' },
    });
    expect(t.deleteRepost).not.toHaveBeenCalled();
    expect(t.reposts()).toHaveLength(1);
  });

  it('Bluesky の削除が失敗したら、エラーを返し、行を消さない', async () => {
    const t = setup();
    t.seedRepost();
    t.deleteRepost.mockReturnValueOnce(RA.err(failure));

    const result = await t.undoRepost.run({ feedItemId: POST });

    expect(result).toEqual({ ok: false, err: failure });
    expect(t.reposts()).toEqual([{ subjectUri: POST, repostUri: REPOST, createdAt: 1 }]);
  });
});
