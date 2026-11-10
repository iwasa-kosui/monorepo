import { describe, expect, it } from 'vitest';

import { AccountSchema } from './entities.ts';
import { blueskyProfileUrlOf, toBlueskyAccount } from './toBlueskyAccount.ts';

const options = {
  defaultAvatarUrl: 'https://iori.example/default-avatar.png',
  defaultHeaderUrl: 'https://iori.example/default-header.png',
};

describe('toBlueskyAccount', () => {
  it('did と handle から Account の必須項目をすべて満たす値を作る', () => {
    const account = toBlueskyAccount({
      did: 'did:plc:alice',
      handle: 'alice.bsky.social',
      displayName: 'Alice',
      avatarUrl: 'https://cdn.example/alice.jpg',
    }, options);

    expect(AccountSchema.safeParse(account).success).toBe(true);
    expect(account).toEqual({
      id: 'bluesky:did:plc:alice',
      username: 'alice.bsky.social',
      acct: 'alice.bsky.social',
      url: 'https://bsky.app/profile/alice.bsky.social',
      uri: 'https://bsky.app/profile/did:plc:alice',
      display_name: 'Alice',
      note: '',
      avatar: 'https://cdn.example/alice.jpg',
      avatar_static: 'https://cdn.example/alice.jpg',
      header: 'https://iori.example/default-header.png',
      header_static: 'https://iori.example/default-header.png',
      locked: false,
      fields: [],
      emojis: [],
      bot: false,
      group: false,
      discoverable: null,
      indexable: false,
      hide_collections: null,
      created_at: '1970-01-01T00:00:00.000Z',
      last_status_at: null,
      statuses_count: 0,
      followers_count: 0,
      following_count: 0,
    });
  });

  it('表示名が無ければ handle を表示名にし、アバターが無ければ既定の画像にする', () => {
    const account = toBlueskyAccount({
      did: 'did:plc:bob',
      handle: 'bob.example.com',
      displayName: null,
      avatarUrl: null,
    }, options);

    expect(account.display_name).toBe('bob.example.com');
    expect(account.avatar).toBe(options.defaultAvatarUrl);
    expect(account.avatar_static).toBe(options.defaultAvatarUrl);
  });

  it('プロフィールの URL は handle から作る', () => {
    expect(
      blueskyProfileUrlOf({ did: 'did:plc:alice', handle: 'alice.bsky.social', displayName: null, avatarUrl: null }),
    ).toBe('https://bsky.app/profile/alice.bsky.social');
  });

  it('handle が不正なときはプロフィールの URL を did から作る', () => {
    const author = { did: 'did:plc:alice', handle: 'handle.invalid', displayName: null, avatarUrl: null };

    expect(blueskyProfileUrlOf(author)).toBe('https://bsky.app/profile/did:plc:alice');
    expect(toBlueskyAccount(author, options).url).toBe('https://bsky.app/profile/did:plc:alice');
  });

  it('handle も did も不正なときは handle を encodeURIComponent した URL にする', () => {
    expect(blueskyProfileUrlOf({ did: 'not-a-did', handle: 'a b', displayName: null, avatarUrl: null })).toBe(
      'https://bsky.app/profile/a%20b',
    );
  });
});
