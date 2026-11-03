import type { Account, Status } from '../../adaptor/mastodon/entities.ts';

export const displayStatus = (status: Status): Status => status.reblog ?? status;

export const isLocalAccount = (account: Account): boolean => !account.acct.includes('@');

export const accountHandle = (account: Account): string => {
  if (!isLocalAccount(account)) return account.acct;
  try {
    return `${account.acct}@${new URL(account.uri).host}`;
  } catch {
    return account.acct;
  }
};

export const accountHref = (account: Account): string =>
  isLocalAccount(account) ? `/users/${account.username}` : `/remote-users/${account.id}`;

export const statusHref = (status: Status): string =>
  isLocalAccount(status.account) ? `/users/${status.account.username}/posts/${status.id}` : status.uri;

export const isOwnBoost = (status: Status, accountId: string): boolean =>
  status.reblog !== null && status.account.id === accountId;

export const withFavourited = (status: Status, favourited: boolean): Status => ({
  ...status,
  favourited,
  reblog: status.reblog === null ? null : { ...status.reblog, favourited },
});

export const withReblogged = (status: Status, reblogged: boolean): Status => ({
  ...status,
  reblogged,
  reblog: status.reblog === null ? null : { ...status.reblog, reblogged },
});

export const updateStatusesByPostId = (
  statuses: readonly Status[],
  postId: string,
  updater: (status: Status) => Status,
): readonly Status[] => statuses.map((status) => displayStatus(status).id === postId ? updater(status) : status);

export const removeStatusesByPostId = (
  statuses: readonly Status[],
  postId: string,
): readonly Status[] => statuses.filter((status) => displayStatus(status).id !== postId);
