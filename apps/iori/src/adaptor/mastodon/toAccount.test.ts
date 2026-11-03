import { describe, expect, it } from 'vitest';

import type { LocalActor, RemoteActor } from '../../domain/actor/actor.ts';
import { ActorId } from '../../domain/actor/actorId.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import { UserId } from '../../domain/user/userId.ts';
import { Username } from '../../domain/user/username.ts';
import { AccountSchema } from './entities.ts';
import { toAccount, type ToAccountOptions } from './toAccount.ts';

const options: ToAccountOptions = {
  defaultAvatarUrl: 'https://iori.example/static/avatar.png',
  defaultHeaderUrl: 'https://iori.example/static/header.png',
  followersCount: 3,
  followingCount: 2,
  statusesCount: 10,
  createdAt: Date.UTC(2025, 0, 2, 3, 4, 5) as Instant,
  lastStatusAt: Date.UTC(2025, 5, 7, 8, 9, 10) as Instant,
};

const userId = UserId.generate();
const user = { id: userId, username: Username.orThrow('kosui') };
const localActor: LocalActor = {
  id: ActorId.generate(),
  userId,
  type: 'local',
  uri: 'https://iori.example/users/kosui',
  inboxUrl: 'https://iori.example/users/kosui/inbox',
};
const remoteActor: RemoteActor = {
  id: ActorId.generate(),
  type: 'remote',
  uri: 'https://remote.example/users/alice',
  inboxUrl: 'https://remote.example/users/alice/inbox',
  username: 'alice',
  url: 'https://remote.example/@alice',
  logoUri: 'https://remote.example/avatar.png',
};

describe('toAccount', () => {
  it('converts a local actor into an Account that passes the schema', () => {
    const account = toAccount({ type: 'local', user, actor: localActor }, options);

    expect(AccountSchema.safeParse(account).success).toBe(true);
    expect(account).toMatchObject({
      id: localActor.id,
      username: 'kosui',
      acct: 'kosui',
      display_name: 'kosui',
      note: '',
      url: 'https://iori.example/users/kosui',
      uri: 'https://iori.example/users/kosui',
      avatar: options.defaultAvatarUrl,
      avatar_static: options.defaultAvatarUrl,
      header: options.defaultHeaderUrl,
      header_static: options.defaultHeaderUrl,
      created_at: '2025-01-02T03:04:05.000Z',
      last_status_at: '2025-06-07',
      followers_count: 3,
      following_count: 2,
      statuses_count: 10,
    });
  });

  it('prefers the logoUri of a local actor and keeps last_status_at null', () => {
    const account = toAccount(
      { type: 'local', user, actor: { ...localActor, logoUri: 'https://iori.example/uploads/logo.png' } },
      { ...options, lastStatusAt: null },
    );

    expect(account.avatar).toBe('https://iori.example/uploads/logo.png');
    expect(account.avatar_static).toBe('https://iori.example/uploads/logo.png');
    expect(account.last_status_at).toBeNull();
  });

  it('converts a remote actor into user@host', () => {
    const account = toAccount({ type: 'remote', actor: remoteActor }, options);

    expect(AccountSchema.safeParse(account).success).toBe(true);
    expect(account).toMatchObject({
      id: remoteActor.id,
      username: 'alice',
      acct: 'alice@remote.example',
      url: 'https://remote.example/@alice',
      uri: 'https://remote.example/users/alice',
      avatar: 'https://remote.example/avatar.png',
    });
  });

  it('falls back to the URI when a remote actor has no username and url', () => {
    const account = toAccount(
      { type: 'remote', actor: { ...remoteActor, username: undefined, url: undefined, logoUri: undefined } },
      options,
    );

    expect(account.username).toBe('alice');
    expect(account.acct).toBe('alice@remote.example');
    expect(account.url).toBe('https://remote.example/users/alice');
    expect(account.avatar).toBe(options.defaultAvatarUrl);
  });
});
