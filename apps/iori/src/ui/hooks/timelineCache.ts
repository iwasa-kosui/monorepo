import type { CredentialAccount, Status } from '../../adaptor/mastodon/entities.ts';
import { homeTimelineUrl } from '../api/mastodonClient.ts';
import { keepsCachedView, readMeCache, readPageCache, writeMeCache, writePageCache } from '../api/pageCache.ts';
import { stateAfterFetchFailure } from './timelineFailure.ts';
import type { TimelineState } from './useTimeline.ts';

export type CachedTimeline = Readonly<{
  me: CredentialAccount;
  statuses: readonly Status[];
  nextMaxId: string | undefined;
}>;

export const readTimelineCache = (): CachedTimeline | undefined => {
  const page = readPageCache<Status>(homeTimelineUrl());
  const me = readMeCache();
  return page === undefined || me === undefined
    ? undefined
    : { me, statuses: page.items, nextMaxId: page.nextMaxId };
};

export const writeTimelineCache = (
  page: Readonly<{ items: readonly Status[]; nextMaxId: string | undefined; prevMinId: string | undefined }>,
  me: CredentialAccount,
): void => {
  writePageCache(homeTimelineUrl(), page);
  writeMeCache(me);
};

export const initialTimelineState = (cached: CachedTimeline | undefined): TimelineState =>
  cached === undefined
    ? { status: 'loading' }
    : {
      status: 'success',
      data: { me: cached.me, statuses: cached.statuses, nextMaxId: cached.nextMaxId, followers: [], following: [] },
    };

export const stateAfterFirstPage = (
  prev: TimelineState,
  me: CredentialAccount,
  statuses: readonly Status[],
  nextMaxId: string | undefined,
): TimelineState => ({
  status: 'success',
  data: {
    me,
    statuses,
    nextMaxId,
    followers: prev.status === 'success' ? prev.data.followers : [],
    following: prev.status === 'success' ? prev.data.following : [],
  },
});

export const stateAfterFirstPageFailure = (
  prev: TimelineState,
  isShowingCache: boolean,
  isUnauthorized: boolean,
  error: string,
): TimelineState =>
  prev.status === 'success' && keepsCachedView(isShowingCache, isUnauthorized)
    ? prev
    : stateAfterFetchFailure(prev, false, error);
