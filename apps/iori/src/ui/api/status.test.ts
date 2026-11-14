import { describe, expect, it } from 'vitest';

import type { Account, Poll, Status } from '../../adaptor/mastodon/entities.ts';
import {
  accountHandle,
  accountHref,
  detailHref,
  isLocalAccount,
  remoteUserPathOf,
  removeStatusesByAccountId,
  removeStatusesByPostId,
  statusHref,
  updateStatusesByPostId,
  withBookmarked,
  withFavourited,
  withPoll,
  withReblogged,
  withUpdatedStatus,
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

const blueskyAccount = {
  id: 'bluesky:did:plc:carol',
  username: 'carol.bsky.social',
  acct: 'carol.bsky.social',
  url: 'https://bsky.app/profile/carol.bsky.social',
  uri: 'https://bsky.app/profile/did:plc:carol',
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

  it('links a Bluesky account to its profile page in iori and shows its handle as it is', () => {
    expect(accountHref(blueskyAccount)).toBe('/bluesky/profile/did%3Aplc%3Acarol');
    expect(accountHandle(blueskyAccount)).toBe('carol.bsky.social');
  });

  it('does not link a Bluesky account whose id does not hold a valid DID', () => {
    expect(accountHref({ ...blueskyAccount, id: 'bluesky:' })).toBe('#');
    expect(accountHref({ ...blueskyAccount, id: 'bluesky:javascript:alert(1)' })).toBe('#');
  });

  it('links to the local post page and the remote post uri', () => {
    expect(statusHref(status('p1'))).toBe('/users/kosui/posts/p1');
    expect(statusHref(status('p2', { account: remoteAccount, uri: 'https://remote.example/notes/2' }))).toBe(
      'https://remote.example/notes/2',
    );
  });
});

describe('detailHref', () => {
  it('links a local post to its post page', () => {
    expect(detailHref(status('p1'))).toBe('/users/kosui/posts/p1');
  });

  it('links a remote post to the detail page in iori', () => {
    expect(detailHref(status('p2', { account: remoteAccount, uri: 'https://remote.example/notes/2' }))).toBe(
      '/posts/p2',
    );
  });
});

describe('status updates', () => {
  it('sets favourited on both the boost and the original', () => {
    const boost = status('r1', { reblog: status('p1') });

    const updated = withFavourited(boost, true);

    expect(updated.favourited).toBe(true);
    expect(updated.reblog?.favourited).toBe(true);
  });

  it('sets bookmarked on both the boost and the original inside it', () => {
    const boost = status('r1', { reblog: status('p1') });

    const updated = withBookmarked(boost, true);

    expect(updated.bookmarked).toBe(true);
    expect(updated.reblog?.bookmarked).toBe(true);
  });

  it('sets bookmarked on a plain status without creating a reblog', () => {
    const updated = withBookmarked(status('p1'), true);

    expect(updated.bookmarked).toBe(true);
    expect(updated.reblog).toBeNull();
  });

  it('copies bookmarked from the response to the boost along with the other viewer flags', () => {
    const boost = status('r1', { reblog: status('p1') });
    const response = status('p1', { bookmarked: true });

    const updated = withUpdatedStatus(boost, response);

    expect(updated.bookmarked).toBe(true);
    expect(updated.reblog).toBe(response);
  });

  it('replaces the poll of a plain status', () => {
    const poll = { id: 'p1', voted: true, own_votes: [1] } as Poll;

    const updated = withPoll(status('p1', { poll: { id: 'p1', voted: false } as Poll }), poll);

    expect(updated.poll).toBe(poll);
    expect(updated.reblog).toBeNull();
  });

  it('replaces the poll of the original inside a boost and leaves the boost as it was', () => {
    const poll = { id: 'p1', voted: true, own_votes: [1] } as Poll;
    const boost = status('r1', { reblog: status('p1', { poll: { id: 'p1', voted: false } as Poll }) });

    const updated = withPoll(boost, poll);

    expect(updated.reblog?.poll).toBe(poll);
    expect(updated.poll).toBe(boost.poll);
  });

  it('sets reblogged on a plain status without creating a reblog', () => {
    const updated = withReblogged(status('p1'), true);

    expect(updated.reblogged).toBe(true);
    expect(updated.reblog).toBeNull();
  });

  it('replaces a plain status with the server response', () => {
    const response = status('p1', { favourited: true, favourites_count: 3 });

    expect(withUpdatedStatus(status('p1'), response)).toBe(response);
  });

  it('replaces the original inside a boost and copies the viewer flags to the boost', () => {
    const boost = status('r1', { reblog: status('p1') });
    const response = status('p1', { favourited: true, favourites_count: 3 });

    const updated = withUpdatedStatus(boost, response);

    expect(updated.id).toBe('r1');
    expect(updated.favourited).toBe(true);
    expect(updated.reblog).toBe(response);
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

  describe('removeStatusesByAccountId', () => {
    it('removes the statuses written by the account', () => {
      const mine = status('p1');
      const theirs = status('p2', { account: remoteAccount });

      expect(removeStatusesByAccountId([mine, theirs], 'actor-2').map((s) => s.id)).toEqual(['p1']);
    });

    it('removes a boost whose original was written by the account, as the server does', () => {
      const boostOfTheirs = status('r1', { reblog: status('p2', { account: remoteAccount }) });
      const other = status('p1');

      expect(removeStatusesByAccountId([boostOfTheirs, other], 'actor-2').map((s) => s.id)).toEqual(['p1']);
    });

    it('removes a boost made by the account, as the server does', () => {
      const boostByTheirs = status('r1', { account: remoteAccount, reblog: status('p1') });
      const other = status('p2');

      expect(removeStatusesByAccountId([boostByTheirs, other], 'actor-2').map((s) => s.id)).toEqual(['p2']);
    });

    it('keeps everything when the account has no statuses', () => {
      const statuses = [status('p1'), status('r1', { reblog: status('p2') })];

      expect(removeStatusesByAccountId(statuses, 'actor-9')).toEqual(statuses);
    });
  });
});
