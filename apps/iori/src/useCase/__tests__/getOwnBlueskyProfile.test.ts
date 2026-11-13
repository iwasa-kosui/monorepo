import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { BlueskyClientError } from '../../ports/blueskyClient.ts';
import type { BlueskyProfile, BlueskyProfileReader } from '../../ports/blueskyProfileReader.ts';
import { GetOwnBlueskyProfileUseCase } from '../getOwnBlueskyProfile.ts';

const failure: BlueskyClientError = { type: 'BlueskyClientError', kind: 'auth', message: 'login failed', status: 401 };
const profile: BlueskyProfile = {
  did: 'did:plc:me',
  handle: 'me.bsky.social',
  displayName: 'Me',
  description: null,
  avatar: null,
  banner: null,
  followersCount: 0,
  followsCount: 0,
  postsCount: 0,
  viewerFollowingUri: undefined,
  viewerFollowedBy: false,
};

describe('GetOwnBlueskyProfileUseCase', () => {
  it('自分の DID でプロフィールを読む', async () => {
    const getProfile = vi.fn<BlueskyProfileReader['getProfile']>(async () => RA.ok(profile));
    const useCase = GetOwnBlueskyProfileUseCase.create({
      reader: { getProfile },
      viewerDid: async () => RA.ok('did:plc:me'),
    });

    expect(await useCase.run()).toEqual({ ok: true, val: profile });
    expect(getProfile).toHaveBeenCalledExactlyOnceWith('did:plc:me');
  });

  it('自分の DID が取れなければ、プロフィールを読まずにそのエラーを返す', async () => {
    const getProfile = vi.fn<BlueskyProfileReader['getProfile']>();
    const useCase = GetOwnBlueskyProfileUseCase.create({
      reader: { getProfile },
      viewerDid: async () => RA.err(failure),
    });

    expect(await useCase.run()).toEqual({ ok: false, err: failure });
    expect(getProfile).not.toHaveBeenCalled();
  });
});
