import type { CredentialAccount, Status } from '../../adaptor/mastodon/entities.ts';
import { blueskyHomeTimelineUrl, type BlueskyTimelinePage, homeTimelineUrl } from '../api/mastodonClient.ts';
import {
  keepsCachedView,
  readBlueskyPageCache,
  readMeCache,
  readPageCache,
  writeBlueskyPageCache,
  writeMeCache,
  writePageCache,
} from '../api/pageCache.ts';
import { type BlueskySource, blueskySourceOf } from './homeFeed.ts';
import { stateAfterFetchFailure } from './timelineFailure.ts';
import type { TimelineState } from './useTimeline.ts';

export type CachedTimeline = Readonly<{
  me: CredentialAccount;
  statuses: readonly Status[];
  nextMaxId: string | undefined;
  bluesky: BlueskySource;
}>;

export const readTimelineCache = (): CachedTimeline | undefined => {
  const page = readPageCache<Status>(homeTimelineUrl());
  const me = readMeCache();
  return page === undefined || me === undefined
    ? undefined
    : {
      me,
      statuses: page.items,
      nextMaxId: page.nextMaxId,
      bluesky: blueskySourceOf(readBlueskyPageCache(blueskyHomeTimelineUrl())),
    };
};

export const writeTimelineCache = (
  page: Readonly<{ items: readonly Status[]; nextMaxId: string | undefined; prevMinId: string | undefined }>,
  me: CredentialAccount,
  blueskyPage: BlueskyTimelinePage | undefined,
): void => {
  writePageCache(homeTimelineUrl(), page);
  writeMeCache(me);
  if (blueskyPage !== undefined) writeBlueskyPageCache(blueskyHomeTimelineUrl(), blueskyPage);
};

export const initialTimelineState = (cached: CachedTimeline | undefined): TimelineState =>
  cached === undefined
    ? { status: 'loading' }
    : {
      status: 'success',
      data: {
        me: cached.me,
        statuses: cached.statuses,
        nextMaxId: cached.nextMaxId,
        bluesky: cached.bluesky,
        followers: [],
        following: [],
      },
    };

export const stateAfterFirstPage = (
  prev: TimelineState,
  me: CredentialAccount,
  statuses: readonly Status[],
  nextMaxId: string | undefined,
  bluesky: BlueskySource,
): TimelineState => ({
  status: 'success',
  data: {
    me,
    statuses,
    nextMaxId,
    bluesky,
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
