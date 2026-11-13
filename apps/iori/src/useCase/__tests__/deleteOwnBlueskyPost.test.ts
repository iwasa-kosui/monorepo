import type { RequestContext } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1PostIdsResolverByBlueskyUris } from '../../adaptor/d1/blueskyNotification/postIdsResolverByBlueskyUris.ts';
import { createD1BlueskyTimelineItemsDeletedStore } from '../../adaptor/d1/blueskyTimeline/blueskyTimelineItemsDeletedStore.ts';
import { PostId } from '../../domain/post/postId.ts';
import { UserId } from '../../domain/user/userId.ts';
import type { BlueskyChatClient, BlueskyClient, BlueskyClientError } from '../../ports/blueskyClient.ts';
import { DeleteOwnBlueskyPostUseCase } from '../deleteOwnBlueskyPost.ts';
import type { DeletePostUseCase } from '../deletePost.ts';

const ME = 'did:plc:me';
const POST = `at://${ME}/app.bsky.feed.post/3kmine`;
const CROSSPOSTED = `at://${ME}/app.bsky.feed.post/3kcross`;
const OTHERS = 'at://did:plc:other/app.bsky.feed.post/3kother';
const POST_ID = PostId.orThrow('0198a2b4-6d7e-7c3f-8a1b-2c3d4e5f6a7b');
const USER_ID = UserId.orThrow('0198a2b4-6d7e-7c3f-8a1b-2c3d4e5f6a7c');
const ctx = {} as RequestContext<unknown>;
const failure: BlueskyClientError = {
  type: 'BlueskyClientError',
  kind: 'http',
  message: 'deleteRecord failed: status 500',
  status: 500,
};

const setup = () => {
  const { db, sqlite } = createSqliteD1Fixture();
  const insertItem = sqlite.prepare(
    'INSERT INTO bluesky_timeline_items(feedItemId,uri,cid,authorDid,authorHandle,text,facets,repostedByDid,postedAt,indexedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  );
  for (const uri of [POST, CROSSPOSTED, OTHERS]) {
    insertItem.run(uri, uri, 'bafy', uri.split('/')[2], 'handle.bsky.social', 't', '[]', null, 1, 1, 1);
  }
  sqlite.prepare(
    'INSERT INTO bluesky_crossposts(postId,status,uri,attempts,createdAt,updatedAt) VALUES (?,?,?,?,?,?)',
  ).run(POST_ID, 'sent', CROSSPOSTED, 1, 1, 1);
  const deleteRecord = vi.fn<BlueskyClient['deleteRecord']>(async () => RA.ok(undefined));
  const viewerDid = vi.fn<BlueskyChatClient['viewerDid']>(async () => RA.ok(ME));
  const deletePost = vi.fn<DeletePostUseCase['run']>(async () => RA.ok({ success: true }));
  const useCase = DeleteOwnBlueskyPostUseCase.create({
    client: { deleteRecord, viewerDid },
    postIdsResolver: createD1PostIdsResolverByBlueskyUris(db),
    deletePost: { run: deletePost },
    timelineItemsDeletedStore: createD1BlueskyTimelineItemsDeletedStore(db),
  });
  const uris = () =>
    sqlite.prepare('SELECT uri FROM bluesky_timeline_items ORDER BY uri').all().map((row) =>
      (row as { uri: string }).uri
    );
  return { useCase, deleteRecord, viewerDid, deletePost, uris };
};

const run = (t: ReturnType<typeof setup>, uri: string) => t.useCase.run({ uri, userId: USER_ID, ctx });

describe('DeleteOwnBlueskyPostUseCase', () => {
  it('Bluesky に直接送った自分の投稿は、uri の rkey で削除し、タイムラインの行も消す', async () => {
    const t = setup();

    const result = await run(t, POST);

    expect(result).toEqual({ ok: true, val: { viaCrosspost: false } });
    expect(t.deleteRecord).toHaveBeenCalledExactlyOnceWith('3kmine');
    expect(t.deletePost).not.toHaveBeenCalled();
    expect(t.uris()).toEqual([CROSSPOSTED, OTHERS].sort());
  });

  it('自分の DID と違う repo の投稿は拒否し、Bluesky を削除せず行も残す', async () => {
    const t = setup();

    const result = await run(t, OTHERS);

    expect(result).toEqual({ ok: false, err: { type: 'BlueskyPostNotOwned' } });
    expect(t.deleteRecord).not.toHaveBeenCalled();
    expect(t.deletePost).not.toHaveBeenCalled();
    expect(t.uris()).toContain(OTHERS);
  });

  it('handle 形式の repo は自分の DID と一致しないので拒否する', async () => {
    const t = setup();

    const result = await run(t, 'at://me.bsky.social/app.bsky.feed.post/3kmine');

    expect(result).toEqual({ ok: false, err: { type: 'BlueskyPostNotOwned' } });
    expect(t.deleteRecord).not.toHaveBeenCalled();
  });

  it('collection が app.bsky.feed.post でない uri は不正な入力として、Bluesky を呼ばない', async () => {
    const t = setup();

    for (const uri of [`at://${ME}/app.bsky.feed.like/3kmine`, `at://${ME}/app.bsky.feed.post`, 'not-a-uri']) {
      expect(await run(t, uri)).toEqual({ ok: false, err: { type: 'BlueskyPostUriInvalid' } });
    }

    expect(t.viewerDid).not.toHaveBeenCalled();
    expect(t.deleteRecord).not.toHaveBeenCalled();
  });

  it('自分の DID を取得できなければ、そのエラーを返し、何も削除しない', async () => {
    const t = setup();
    t.viewerDid.mockReturnValueOnce(RA.err(failure));

    const result = await run(t, POST);

    expect(result).toEqual({ ok: false, err: failure });
    expect(t.deleteRecord).not.toHaveBeenCalled();
    expect(t.uris()).toContain(POST);
  });

  it('PDS の削除が失敗したら、エラーを返し、タイムラインの行を残す', async () => {
    const t = setup();
    t.deleteRecord.mockReturnValueOnce(RA.err(failure));

    const result = await run(t, POST);

    expect(result).toEqual({ ok: false, err: failure });
    expect(t.uris()).toContain(POST);
  });

  it('iori からのクロスポストの uri は、Bluesky を直接削除せず、iori の投稿の削除に委ねる', async () => {
    const t = setup();

    const result = await run(t, CROSSPOSTED);

    expect(result).toEqual({ ok: true, val: { viaCrosspost: true } });
    expect(t.deletePost).toHaveBeenCalledExactlyOnceWith({ userId: USER_ID, postId: POST_ID, ctx });
    expect(t.deleteRecord).not.toHaveBeenCalled();
  });

  it('iori の投稿の削除が失敗したら、そのエラーを返す', async () => {
    const t = setup();
    const unauthorized = { type: 'UnauthorizedError', message: 'You are not authorized to delete this post.' } as const;
    t.deletePost.mockReturnValueOnce(RA.err(unauthorized));

    const result = await run(t, CROSSPOSTED);

    expect(result).toEqual({ ok: false, err: unauthorized });
    expect(t.deleteRecord).not.toHaveBeenCalled();
  });
});
