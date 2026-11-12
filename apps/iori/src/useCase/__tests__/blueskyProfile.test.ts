import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { BlueskyClient, BlueskyClientError } from '../../ports/blueskyClient.ts';
import type { BlueskyProfile, BlueskyProfileReader } from '../../ports/blueskyProfileReader.ts';
import { FollowBlueskyActorUseCase } from '../followBlueskyActor.ts';
import { GetBlueskyProfileUseCase } from '../getBlueskyProfile.ts';
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
  const reader = { getProfile: vi.fn(getProfile), getAuthorFeed: vi.fn<BlueskyProfileReader['getAuthorFeed']>() };
  const createFollow = vi.fn<BlueskyClient['createFollow']>(async () => RA.ok({ uri: CREATED }));
  const deleteFollow = vi.fn<BlueskyClient['deleteFollow']>(async () => RA.ok(undefined));
  return {
    reader,
    createFollow,
    deleteFollow,
    follow: FollowBlueskyActorUseCase.create({ reader, client: { createFollow } }),
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
    const page = { items: [], cursor: 'next' };
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

describe('FollowBlueskyActorUseCase', () => {
  it('既にフォロー中なら createFollow を呼ばずに、その uri を返す', async () => {
    const t = setup(async () => RA.ok(profile({ viewerFollowingUri: FOLLOW })));

    const result = await t.follow.run({ did: DID });

    expect(result).toEqual({ ok: true, val: { following: true, followUri: FOLLOW } });
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
