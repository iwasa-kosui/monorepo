import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { BlueskyClient, BlueskyClientError } from '../../ports/blueskyClient.ts';
import type { BlueskyProfile, BlueskyProfileReader } from '../../ports/blueskyProfileReader.ts';
import { FollowBlueskyActorUseCase } from '../followBlueskyActor.ts';
import { GetBlueskyProfileUseCase } from '../getBlueskyProfile.ts';
import { ListBlueskyActorLikesUseCase } from '../listBlueskyActorLikes.ts';
import { ListBlueskyAuthorFeedUseCase } from '../listBlueskyAuthorFeed.ts';
import { UnfollowBlueskyActorUseCase } from '../unfollowBlueskyActor.ts';

const DID = 'did:plc:alice';
const FOLLOW = 'at://did:plc:me/app.bsky.graph.follow/3kold';
const CREATED = 'at://did:plc:me/app.bsky.graph.follow/3knew';
const notFound: BlueskyClientError = {
  type: 'BlueskyClientError',
  kind: 'http',
  message: 'getProfile failed: status 400 InvalidRequest',
  status: 400,
  code: 'InvalidRequest',
};
const recordMissing: BlueskyClientError = {
  type: 'BlueskyClientError',
  kind: 'http',
  message: 'getRecord failed: status 400 RecordNotFound',
  status: 400,
  code: 'RecordNotFound',
};
const failure: BlueskyClientError = {
  type: 'BlueskyClientError',
  kind: 'http',
  message: 'createFollow failed: status 500',
  status: 500,
};

const profile = (overrides: Partial<BlueskyProfile> = {}): BlueskyProfile => ({
  did: DID,
  handle: 'alice.bsky.social',
  displayName: 'Alice',
  description: null,
  avatar: null,
  banner: null,
  followersCount: 0,
  followsCount: 0,
  postsCount: 0,
  viewerFollowingUri: undefined,
  viewerFollowedBy: false,
  ...overrides,
});

const setup = (getProfile: BlueskyProfileReader['getProfile'] = async () => RA.ok(profile())) => {
  const reader = {
    getProfile: vi.fn(getProfile),
    getAuthorFeed: vi.fn<BlueskyProfileReader['getAuthorFeed']>(),
    getActorLikes: vi.fn<BlueskyProfileReader['getActorLikes']>(),
  };
  const createFollow = vi.fn<BlueskyClient['createFollow']>(async () => RA.ok({ uri: CREATED }));
  const deleteFollow = vi.fn<BlueskyClient['deleteFollow']>(async () => RA.ok(undefined));
  const getRecord = vi.fn<BlueskyClient['getRecord']>(async () => RA.err(recordMissing));
  return {
    reader,
    createFollow,
    deleteFollow,
    getRecord,
    follow: FollowBlueskyActorUseCase.create({ reader, client: { createFollow, getRecord } }),
    unfollow: UnfollowBlueskyActorUseCase.create({ reader, client: { deleteFollow } }),
  };
};

describe('GetBlueskyProfileUseCase', () => {
  it('actor のプロフィールを返す', async () => {
    const t = setup();

    const result = await GetBlueskyProfileUseCase.create({ reader: t.reader }).run({ actor: 'alice.bsky.social' });

    expect(result).toEqual({ ok: true, val: profile() });
    expect(t.reader.getProfile).toHaveBeenCalledExactlyOnceWith('alice.bsky.social');
  });

  it('見つからない応答を BlueskyProfileNotFound にし、それ以外の失敗はそのまま返す', async () => {
    const missing = setup(async () => RA.err(notFound));
    const failing = setup(async () => RA.err(failure));

    expect(await GetBlueskyProfileUseCase.create({ reader: missing.reader }).run({ actor: DID })).toEqual({
      ok: false,
      err: { type: 'BlueskyProfileNotFound' },
    });
    expect(await GetBlueskyProfileUseCase.create({ reader: failing.reader }).run({ actor: DID })).toEqual({
      ok: false,
      err: failure,
    });
  });
});

describe('ListBlueskyAuthorFeedUseCase', () => {
  it('actor と cursor を渡して投稿とカーソルを返す', async () => {
    const page = { items: [], cursor: 'next', unavailable: null };
    const getAuthorFeed = vi.fn<BlueskyProfileReader['getAuthorFeed']>(async () => RA.ok(page));

    const result = await ListBlueskyAuthorFeedUseCase.create({ reader: { getAuthorFeed } }).run({
      actor: DID,
      cursor: 'abc',
    });

    expect(result).toEqual({ ok: true, val: page });
    expect(getAuthorFeed).toHaveBeenCalledExactlyOnceWith({ actor: DID, cursor: 'abc' });
  });

  it('見つからない応答を BlueskyProfileNotFound にし、それ以外の失敗はそのまま返す', async () => {
    const missing = ListBlueskyAuthorFeedUseCase.create({
      reader: { getAuthorFeed: async () => RA.err({ ...notFound, code: 'AccountTakedown' }) },
    });
    const failing = ListBlueskyAuthorFeedUseCase.create({ reader: { getAuthorFeed: async () => RA.err(failure) } });

    expect(await missing.run({ actor: DID, cursor: undefined })).toEqual({
      ok: false,
      err: { type: 'BlueskyProfileNotFound' },
    });
    expect(await failing.run({ actor: DID, cursor: undefined })).toEqual({ ok: false, err: failure });
  });
});

describe('ListBlueskyActorLikesUseCase', () => {
  const ME = 'did:plc:me';

  it('自分の DID を actor にして cursor を渡し、投稿とカーソルを返す', async () => {
    const page = { items: [], cursor: 'next' };
    const getActorLikes = vi.fn<BlueskyProfileReader['getActorLikes']>(async () => RA.ok(page));

    const result = await ListBlueskyActorLikesUseCase.create({
      reader: { getActorLikes },
      viewerDid: async () => RA.ok(ME),
    }).run({ cursor: 'abc' });

    expect(result).toEqual({ ok: true, val: page });
    expect(getActorLikes).toHaveBeenCalledExactlyOnceWith({ actor: ME, cursor: 'abc' });
  });

  it('自分の DID が取れなければその失敗を返し、reader を呼ばない', async () => {
    const getActorLikes = vi.fn<BlueskyProfileReader['getActorLikes']>();

    const result = await ListBlueskyActorLikesUseCase.create({
      reader: { getActorLikes },
      viewerDid: async () => RA.err(failure),
    }).run({ cursor: undefined });

    expect(result).toEqual({ ok: false, err: failure });
    expect(getActorLikes).not.toHaveBeenCalled();
  });

  it('reader の失敗をそのまま返す', async () => {
    const result = await ListBlueskyActorLikesUseCase.create({
      reader: { getActorLikes: async () => RA.err(failure) },
      viewerDid: async () => RA.ok(ME),
    }).run({ cursor: undefined });

    expect(result).toEqual({ ok: false, err: failure });
  });
});

describe('FollowBlueskyActorUseCase', () => {
  it('viewer.following の記録が自分の repo にあれば、createFollow を呼ばずにその uri を返す', async () => {
    const t = setup(async () => RA.ok(profile({ viewerFollowingUri: FOLLOW })));
    t.getRecord.mockReturnValueOnce(RA.ok({ uri: FOLLOW, cid: 'cid', rkey: '3kold', value: { subject: DID } }));

    const result = await t.follow.run({ did: DID });

    expect(result).toEqual({ ok: true, val: { following: true, followUri: FOLLOW } });
    expect(t.getRecord).toHaveBeenCalledExactlyOnceWith('3kold', 'app.bsky.graph.follow');
    expect(t.createFollow).not.toHaveBeenCalled();
  });

  it('getProfile が古い viewer.following を返しても、記録が無ければ createFollow を呼ぶ', async () => {
    const t = setup(async () => RA.ok(profile({ viewerFollowingUri: FOLLOW })));

    const result = await t.follow.run({ did: DID });

    expect(result).toEqual({ ok: true, val: { following: true, followUri: CREATED } });
    expect(t.getRecord).toHaveBeenCalledExactlyOnceWith('3kold', 'app.bsky.graph.follow');
    expect(t.createFollow).toHaveBeenCalledExactlyOnceWith(DID);
  });

  it('body の followUri の記録があれば、createFollow を呼ばずにその uri を返す', async () => {
    const t = setup();
    const known = 'at://did:plc:me/app.bsky.graph.follow/3kknown';
    t.getRecord.mockReturnValueOnce(RA.ok({ uri: known, cid: 'cid', rkey: '3kknown', value: { subject: DID } }));

    const result = await t.follow.run({ did: DID, followUri: known });

    expect(result).toEqual({ ok: true, val: { following: true, followUri: known } });
    expect(t.getRecord).toHaveBeenCalledExactlyOnceWith('3kknown', 'app.bsky.graph.follow');
    expect(t.createFollow).not.toHaveBeenCalled();
  });

  it('body の followUri と viewer.following が同じなら getRecord は1回だけ呼び、follow の uri でない値は確かめない', async () => {
    const same = setup(async () => RA.ok(profile({ viewerFollowingUri: FOLLOW })));
    const invalid = setup();

    await same.follow.run({ did: DID, followUri: FOLLOW });
    await invalid.follow.run({ did: DID, followUri: 'at://did:plc:me/app.bsky.feed.like/3k1' });

    expect(same.getRecord).toHaveBeenCalledTimes(1);
    expect(invalid.getRecord).not.toHaveBeenCalled();
    expect(invalid.createFollow).toHaveBeenCalledExactlyOnceWith(DID);
  });

  it('見つけた記録の subject が対象の did と違えば「フォロー済み」とみなさず、次の候補を確かめる', async () => {
    const other = 'at://did:plc:me/app.bsky.graph.follow/3kother';
    const t = setup(async () => RA.ok(profile({ viewerFollowingUri: FOLLOW })));
    t.getRecord
      .mockReturnValueOnce(RA.ok({ uri: other, cid: 'cid', rkey: '3kother', value: { subject: 'did:plc:bob' } }))
      .mockReturnValueOnce(RA.ok({ uri: FOLLOW, cid: 'cid', rkey: '3kold', value: { subject: DID } }));

    const result = await t.follow.run({ did: DID, followUri: other });

    expect(result).toEqual({ ok: true, val: { following: true, followUri: FOLLOW } });
    expect(t.getRecord).toHaveBeenCalledTimes(2);
    expect(t.createFollow).not.toHaveBeenCalled();
  });

  it('どの候補の記録も対象の did の follow でなければ、createFollow を呼ぶ', async () => {
    const t = setup(async () => RA.ok(profile({ viewerFollowingUri: FOLLOW })));
    t.getRecord
      .mockReturnValueOnce(RA.ok({ uri: FOLLOW, cid: 'cid', rkey: '3kold', value: { subject: 'did:plc:bob' } }))
      .mockReturnValueOnce(RA.ok({ uri: FOLLOW, cid: 'cid', rkey: '3kold' }));

    const result = await t.follow.run({ did: DID, followUri: CREATED });

    expect(result).toEqual({ ok: true, val: { following: true, followUri: CREATED } });
    expect(t.getRecord).toHaveBeenCalledTimes(2);
    expect(t.createFollow).toHaveBeenCalledExactlyOnceWith(DID);
  });

  it('記録が無いことを示す 404 も「無い」として扱い、createFollow を呼ぶ', async () => {
    const t = setup(async () => RA.ok(profile({ viewerFollowingUri: FOLLOW })));
    t.getRecord.mockReturnValueOnce(RA.err({ ...failure, status: 404 }));

    const result = await t.follow.run({ did: DID });

    expect(result).toEqual({ ok: true, val: { following: true, followUri: CREATED } });
  });

  it('getRecord の記録が無い以外の失敗はエラーとして返し、createFollow を呼ばない', async () => {
    const t = setup(async () => RA.ok(profile({ viewerFollowingUri: FOLLOW })));
    t.getRecord.mockReturnValueOnce(RA.err(failure));

    expect(await t.follow.run({ did: DID })).toEqual({ ok: false, err: failure });
    expect(t.createFollow).not.toHaveBeenCalled();
  });

  it('未フォローなら createFollow を呼び、作った uri を返す', async () => {
    const t = setup();

    const result = await t.follow.run({ did: DID });

    expect(result).toEqual({ ok: true, val: { following: true, followUri: CREATED } });
    expect(t.reader.getProfile).toHaveBeenCalledExactlyOnceWith(DID);
    expect(t.createFollow).toHaveBeenCalledExactlyOnceWith(DID);
  });

  it('プロフィールが見つからなければ BlueskyProfileNotFound を返し、createFollow を呼ばない', async () => {
    const t = setup(async () => RA.err(notFound));

    expect(await t.follow.run({ did: DID })).toEqual({ ok: false, err: { type: 'BlueskyProfileNotFound' } });
    expect(t.createFollow).not.toHaveBeenCalled();
  });

  it('getProfile と createFollow の失敗をそのまま返す', async () => {
    const reading = setup(async () => RA.err(failure));
    const writing = setup();
    writing.createFollow.mockReturnValueOnce(RA.err(failure));

    expect(await reading.follow.run({ did: DID })).toEqual({ ok: false, err: failure });
    expect(await writing.follow.run({ did: DID })).toEqual({ ok: false, err: failure });
  });
});

describe('UnfollowBlueskyActorUseCase', () => {
  it('フォロー中なら deleteFollow を呼び、following: false を返す', async () => {
    const t = setup(async () => RA.ok(profile({ viewerFollowingUri: FOLLOW })));

    const result = await t.unfollow.run({ did: DID });

    expect(result).toEqual({ ok: true, val: { following: false } });
    expect(t.deleteFollow).toHaveBeenCalledExactlyOnceWith(FOLLOW);
  });

  it('getProfile が viewer.following を返さなくても、followUri があれば deleteFollow を呼ぶ', async () => {
    const t = setup();

    const result = await t.unfollow.run({ did: DID, followUri: CREATED });

    expect(result).toEqual({ ok: true, val: { following: false } });
    expect(t.deleteFollow).toHaveBeenCalledExactlyOnceWith(CREATED);
  });

  it('followUri と viewer.following がどちらも follow の uri で値が違えば、両方を消す', async () => {
    const t = setup(async () => RA.ok(profile({ viewerFollowingUri: FOLLOW })));

    const result = await t.unfollow.run({ did: DID, followUri: CREATED });

    expect(result).toEqual({ ok: true, val: { following: false } });
    expect(t.deleteFollow.mock.calls).toEqual([[CREATED], [FOLLOW]]);
  });

  it('followUri と viewer.following が同じなら1回だけ消し、どちらかが follow の uri でなければ followUri だけを消す', async () => {
    const same = setup(async () => RA.ok(profile({ viewerFollowingUri: FOLLOW })));
    const invalid = setup(async () => RA.ok(profile({ viewerFollowingUri: 'at://did:plc:me/app.bsky.feed.like/3k1' })));

    await same.unfollow.run({ did: DID, followUri: FOLLOW });
    await invalid.unfollow.run({ did: DID, followUri: CREATED });

    expect(same.deleteFollow).toHaveBeenCalledExactlyOnceWith(FOLLOW);
    expect(invalid.deleteFollow).toHaveBeenCalledExactlyOnceWith(CREATED);
  });

  it('2つの follow を消すとき、片方が失敗したらエラーを返す', async () => {
    const first = setup(async () => RA.ok(profile({ viewerFollowingUri: FOLLOW })));
    const second = setup(async () => RA.ok(profile({ viewerFollowingUri: FOLLOW })));
    first.deleteFollow.mockReturnValueOnce(RA.err(failure));
    second.deleteFollow.mockReturnValueOnce(RA.ok(undefined)).mockReturnValueOnce(RA.err(failure));

    expect(await first.unfollow.run({ did: DID, followUri: CREATED })).toEqual({ ok: false, err: failure });
    expect(await second.unfollow.run({ did: DID, followUri: CREATED })).toEqual({ ok: false, err: failure });
    expect(first.deleteFollow).toHaveBeenCalledTimes(1);
    expect(second.deleteFollow).toHaveBeenCalledTimes(2);
  });

  it('フォローの記録が無ければ何もせず、following: false を返す', async () => {
    const t = setup();

    const result = await t.unfollow.run({ did: DID });

    expect(result).toEqual({ ok: true, val: { following: false } });
    expect(t.deleteFollow).not.toHaveBeenCalled();
  });

  it('プロフィールが見つからなければ BlueskyProfileNotFound を返す', async () => {
    const t = setup(async () => RA.err(notFound));

    expect(await t.unfollow.run({ did: DID })).toEqual({ ok: false, err: { type: 'BlueskyProfileNotFound' } });
    expect(t.deleteFollow).not.toHaveBeenCalled();
  });

  it('getProfile と deleteFollow の失敗をそのまま返す', async () => {
    const reading = setup(async () => RA.err(failure));
    const writing = setup(async () => RA.ok(profile({ viewerFollowingUri: FOLLOW })));
    writing.deleteFollow.mockReturnValueOnce(RA.err(failure));

    expect(await reading.unfollow.run({ did: DID })).toEqual({ ok: false, err: failure });
    expect(await writing.unfollow.run({ did: DID })).toEqual({ ok: false, err: failure });
  });
});
