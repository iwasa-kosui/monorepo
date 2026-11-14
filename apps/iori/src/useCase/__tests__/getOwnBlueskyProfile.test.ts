import { RA, Result } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { BlueskyClient } from '../../ports/blueskyClient.ts';
import type { BlueskyProfile, BlueskyProfileReader } from '../../ports/blueskyProfileReader.ts';
import { GetOwnBlueskyProfileUseCase } from '../getOwnBlueskyProfile.ts';

const profile: BlueskyProfile = {
  did: 'did:plc:me',
  handle: 'me.bsky.social',
  displayName: '古い表示名',
  description: '古い自己紹介',
  avatar: 'https://cdn.example/avatar.jpg',
  banner: 'https://cdn.example/banner.jpg',
  followersCount: 0,
  followsCount: 0,
  postsCount: 0,
  viewerFollowingUri: undefined,
  viewerFollowedBy: false,
};

const setup = (
  record: Awaited<ReturnType<BlueskyClient['getProfileRecord']>> = Result.ok({
    cid: 'bafyrecord',
    value: { displayName: '新しい表示名', description: '新しい自己紹介' },
  }),
) => {
  const getProfile = vi.fn<BlueskyProfileReader['getProfile']>(async () => RA.ok(profile));
  const getProfileRecord = vi.fn<BlueskyClient['getProfileRecord']>(async () => record);
  const viewerDid = vi.fn(async () => RA.ok('did:plc:me'));
  const useCase = GetOwnBlueskyProfileUseCase.create({
    reader: { getProfile },
    client: { getProfileRecord },
    viewerDid,
  });
  return { useCase, getProfile, getProfileRecord };
};

describe('GetOwnBlueskyProfileUseCase', () => {
  it('表示名・自己紹介・cid を PDS のレコードから、DID・ハンドル・画像を AppView から取る', async () => {
    const t = setup();

    expect(await t.useCase.run()).toEqual({
      ok: true,
      val: {
        did: 'did:plc:me',
        handle: 'me.bsky.social',
        displayName: '新しい表示名',
        description: '新しい自己紹介',
        avatar: 'https://cdn.example/avatar.jpg',
        banner: 'https://cdn.example/banner.jpg',
        cid: 'bafyrecord',
      },
    });
  });

  it('レコードの表示名と自己紹介が文字列でなければ null にする', async () => {
    const t = setup(Result.ok({ cid: 'bafyrecord', value: { displayName: 1, pinnedPost: {} } }));

    expect(await t.useCase.run()).toMatchObject({
      ok: true,
      val: { displayName: null, description: null, cid: 'bafyrecord' },
    });
  });
});
