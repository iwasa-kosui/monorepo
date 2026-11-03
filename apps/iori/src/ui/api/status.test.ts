import { describe, expect, it } from 'vitest';

import type { Account, Status } from '../../adaptor/mastodon/entities.ts';
import {
  accountHandle,
  accountHref,
  displayStatus,
  isLocalAccount,
  isOwnBoost,
  remoteUserPathOf,
  removeStatusesByPostId,
  statusHref,
  updateStatusesByPostId,
  withFavourited,
  withReblogged,
} from './status.ts';

const localAccount = {
  id: 'actor-1',
  username: 'kosui',
  acct: 'kosui',
  uri: 'https://iori.example/users/kosui',
} as Account;
const remoteAccount = {
  id: 'actor-2',
  username: 'alice',
  acct: 'alice@remote.example',
  uri: 'https://remote.example/users/alice',
} as Account;

const status = (id: string, overrides: Partial<Status> = {}): Status =>
  ({
    id,
    uri: `https://iori.example/users/kosui/posts/${id}`,
    account: localAccount,
    reblog: null,
    favourited: false,
    reblogged: false,
    ...overrides,
  }) as Status;

describe('displayStatus', () => {
  it('returns the status itself when it is not a boost', () => {
    const original = status('p1');

    expect(displayStatus(original)).toBe(original);
  });

  it('returns the reblogged status when it is a boost', () => {
    const original = status('p1');
    const boost = status('r1', { account: remoteAccount, reblog: original });

    expect(displayStatus(boost)).toBe(original);
  });
});

describe('account helpers', () => {
  it('treats an acct without a host as local', () => {
    expect(isLocalAccount(localAccount)).toBe(true);
    expect(isLocalAccount(remoteAccount)).toBe(false);
  });

  it('redirects a remote account opened on the local user page to the remote user page', () => {
    expect(remoteUserPathOf(localAccount)).toBeUndefined();
    expect(remoteUserPathOf(remoteAccount)).toBe('/remote-users/actor-2');
  });

  it('builds the handle with the host for a local account and keeps the acct for a remote account', () => {
    expect(accountHandle(localAccount)).toBe('kosui@iori.example');
    expect(accountHandle(remoteAccount)).toBe('alice@remote.example');
  });

  it('links to the user page for a local account and the remote user page for a remote account', () => {
    expect(accountHref(localAccount)).toBe('/users/kosui');
    expect(accountHref(remoteAccount)).toBe('/remote-users/actor-2');
  });

  it('links to the local post page and the remote post uri', () => {
    expect(statusHref(status('p1'))).toBe('/users/kosui/posts/p1');
    expect(statusHref(status('p2', { account: remoteAccount, uri: 'https://remote.example/notes/2' }))).toBe(
      'https://remote.example/notes/2',
    );
  });
});

describe('isOwnBoost', () => {
  it('is true only for a boost made by the account', () => {
    const boost = status('r1', { account: localAccount, reblog: status('p1', { account: remoteAccount }) });

    expect(isOwnBoost(boost, 'actor-1')).toBe(true);
    expect(isOwnBoost(boost, 'actor-9')).toBe(false);
    expect(isOwnBoost(status('p1'), 'actor-1')).toBe(false);
  });
});

describe('status updates', () => {
  it('sets favourited on both the boost and the original', () => {
    const boost = status('r1', { reblog: status('p1') });

    const updated = withFavourited(boost, true);

    expect(updated.favourited).toBe(true);
    expect(updated.reblog?.favourited).toBe(true);
  });

  it('sets reblogged on a plain status without creating a reblog', () => {
    const updated = withReblogged(status('p1'), true);

    expect(updated.reblogged).toBe(true);
    expect(updated.reblog).toBeNull();
  });

  it('updates every status that shows the post, including boosts of it', () => {
    const original = status('p1');
    const boost = status('r1', { reblog: status('p1') });
    const other = status('p2');

    const updated = updateStatusesByPostId([original, boost, other], 'p1', (s) => withFavourited(s, true));

    expect(updated.map((s) => s.favourited)).toEqual([true, true, false]);
  });

  it('removes every status that shows the post, including boosts of it', () => {
    const original = status('p1');
    const boost = status('r1', { reblog: status('p1') });
    const other = status('p2');

    const remaining = removeStatusesByPostId([original, boost, other], 'p1');

    expect(remaining.map((s) => s.id)).toEqual(['p2']);
  });
});
