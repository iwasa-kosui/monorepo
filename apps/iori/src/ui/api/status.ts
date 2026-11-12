import type { Account, Status } from '../../adaptor/mastodon/entities.ts';
import { BLUESKY_ACCOUNT_ID_PREFIX } from '../../adaptor/mastodon/toBlueskyAccount.ts';
import { blueskyProfilePathOf, blueskyProfileUrlOfActor } from '../../helper/blueskyUrl.ts';

export const displayStatus = (status: Status): Status => status.reblog ?? status;

export const isLocalAccount = (account: Account): boolean => !account.acct.includes('@');

export const remoteUserPathOf = (account: Account): string | undefined =>
  isLocalAccount(account) ? undefined : `/remote-users/${account.id}`;

export const accountHandle = (account: Account): string => {
  if (account.id.startsWith(BLUESKY_ACCOUNT_ID_PREFIX) || !isLocalAccount(account)) return account.acct;
  try {
    return `${account.acct}@${new URL(account.uri).host}`;
  } catch {
    return account.acct;
  }
};

export const accountHref = (account: Account): string => {
  if (account.id.startsWith(BLUESKY_ACCOUNT_ID_PREFIX)) {
    const did = account.id.slice(BLUESKY_ACCOUNT_ID_PREFIX.length);
    return blueskyProfileUrlOfActor(did) === undefined ? '#' : blueskyProfilePathOf(did);
  }
  return isLocalAccount(account) ? `/users/${account.username}` : `/remote-users/${account.id}`;
};

export const statusHref = (status: Status): string =>
  isLocalAccount(status.account) ? `/users/${status.account.username}/posts/${status.id}` : status.uri;

export const detailHref = (status: Status): string =>
  isLocalAccount(status.account) ? statusHref(status) : `/posts/${status.id}`;

export const isOwnBoost = (status: Status, accountId: string): boolean =>
  status.reblog !== null && status.account.id === accountId;

export const withFavourited = (status: Status, favourited: boolean): Status => ({
  ...status,
  favourited,
  reblog: status.reblog === null ? null : { ...status.reblog, favourited },
});

export const withBookmarked = (status: Status, bookmarked: boolean): Status => ({
  ...status,
  bookmarked,
  reblog: status.reblog === null ? null : { ...status.reblog, bookmarked },
});

export const withReblogged = (status: Status, reblogged: boolean): Status => ({
  ...status,
  reblogged,
  reblog: status.reblog === null ? null : { ...status.reblog, reblogged },
});

export const withUpdatedStatus = (status: Status, updated: Status): Status =>
  status.reblog === null
    ? updated
    : {
      ...status,
      favourited: updated.favourited,
      reblogged: updated.reblogged,
      bookmarked: updated.bookmarked,
      reblog: updated,
    };

export const updateStatusesByPostId = (
  statuses: readonly Status[],
  postId: string,
  updater: (status: Status) => Status,
): readonly Status[] => statuses.map((status) => displayStatus(status).id === postId ? updater(status) : status);

export const removeStatusesByPostId = (
  statuses: readonly Status[],
  postId: string,
): readonly Status[] => statuses.filter((status) => displayStatus(status).id !== postId);

export const removeStatusesByAccountId = (
  statuses: readonly Status[],
  accountId: string,
): readonly Status[] =>
  statuses.filter((status) => status.account.id !== accountId && displayStatus(status).account.id !== accountId);
