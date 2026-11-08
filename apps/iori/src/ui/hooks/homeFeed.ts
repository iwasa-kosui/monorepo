import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import type { BlueskyTimelinePage } from '../api/mastodonClient.ts';
import { appendUniqueBy } from './appendUnique.ts';

export type BlueskyCursor = Readonly<{ before: number; beforeId: string | null }>;

export type BlueskySource = Readonly<{
  items: readonly IoriBlueskyTimelineItemBody[];
  cursor: BlueskyCursor | undefined;
}>;

export const emptyBlueskySource: BlueskySource = { items: [], cursor: undefined };

export type HomeItem =
  | Readonly<{ kind: 'status'; status: Status }>
  | Readonly<{ kind: 'bluesky'; item: IoriBlueskyTimelineItemBody }>;

export const homeItemKey = (item: HomeItem): string =>
  item.kind === 'status' ? item.status.id : `bluesky:${item.item.feedItemId}`;

export const homeItemTime = (item: HomeItem): number => {
  if (item.kind === 'bluesky') return item.item.indexedAt;
  const time = Date.parse(item.status.created_at);
  return Number.isFinite(time) ? time : 0;
};

export const blueskyCursorOf = (
  page: Pick<BlueskyTimelinePage, 'nextBefore' | 'nextBeforeId'>,
): BlueskyCursor | undefined =>
  page.nextBefore === null ? undefined : { before: page.nextBefore, beforeId: page.nextBeforeId };

export const blueskySourceOf = (page: BlueskyTimelinePage | undefined): BlueskySource =>
  page === undefined ? emptyBlueskySource : { items: page.items, cursor: blueskyCursorOf(page) };

export const blueskyCursorAfterPage = (
  current: BlueskyCursor | undefined,
  page: BlueskyTimelinePage,
): BlueskyCursor | undefined => {
  const next = blueskyCursorOf(page);
  const isStuck = next !== undefined && next.before === current?.before && next.beforeId === current.beforeId;
  return page.items.length === 0 || isStuck ? undefined : next;
};

export const appendBlueskyItems = (
  current: readonly IoriBlueskyTimelineItemBody[],
  incoming: readonly IoriBlueskyTimelineItemBody[],
): readonly IoriBlueskyTimelineItemBody[] => appendUniqueBy(current, incoming, (item) => item.feedItemId);

export const homeFeedCursor = (
  nextMaxId: string | undefined,
  blueskyCursor: BlueskyCursor | undefined,
): string | undefined =>
  nextMaxId === undefined && blueskyCursor === undefined
    ? undefined
    : JSON.stringify([nextMaxId ?? null, blueskyCursor ?? null]);

export type HomeFeedSources = Readonly<{
  statuses: readonly Status[];
  hasMoreStatuses: boolean;
  bluesky: readonly IoriBlueskyTimelineItemBody[];
  hasMoreBluesky: boolean;
}>;

const oldestOf = (times: readonly number[]): number | undefined =>
  times.length === 0 ? undefined : times.reduce((oldest, time) => Math.min(oldest, time));

export const mergeHomeFeed = (
  { statuses, hasMoreStatuses, bluesky, hasMoreBluesky }: HomeFeedSources,
): readonly HomeItem[] => {
  const timed = [
    ...statuses.map((status): HomeItem => ({ kind: 'status', status })),
    ...bluesky.map((item): HomeItem => ({ kind: 'bluesky', item })),
  ].map((item) => ({ item, time: homeItemTime(item) }));
  const timesOf = (kind: HomeItem['kind']) => timed.filter(({ item }) => item.kind === kind).map(({ time }) => time);
  const limits = [
    hasMoreStatuses ? oldestOf(timesOf('status')) : undefined,
    hasMoreBluesky ? oldestOf(timesOf('bluesky')) : undefined,
  ].filter((time): time is number => time !== undefined);
  const floor = limits.length === 0 ? undefined : Math.max(...limits);
  return timed
    .toSorted((a, b) => b.time - a.time)
    .filter(({ time }) => floor === undefined || time >= floor)
    .map(({ item }) => item);
};
