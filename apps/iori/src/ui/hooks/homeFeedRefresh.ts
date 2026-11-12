import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import type { BlueskyTimelinePage, Page } from '../api/mastodonClient.ts';
import {
  type BlueskyCursor,
  blueskyCursorOf,
  type BlueskySource,
  type HomeFeedPaging,
  homeItemKey,
  mergeHomeFeed,
} from './homeFeed.ts';

/**
 * 最新側の取得結果。
 * - merged: 手元の最新アイテムまで途切れずに辿れたので、新着分だけを先頭に足せばよい
 * - replaced: 新着が多すぎて手元とつながらなかった（またはそもそも手元が空）ので丸ごと置き換える
 */
export type SourceRefresh<T, C> =
  | Readonly<{ kind: 'merged'; newer: readonly T[] }>
  | Readonly<{ kind: 'replaced'; items: readonly T[]; cursor: C | undefined }>;

export type StatusesRefresh = SourceRefresh<Status, string>;
export type BlueskyRefresh = SourceRefresh<IoriBlueskyTimelineItemBody, BlueskyCursor>;

/** 新着の取りこぼしを埋めるために辿る最大ページ数。これを超えたら置き換える。 */
export const MAX_REFRESH_PAGES = 5;

export type FetchStatusesPage = (
  params: Readonly<{ sinceId?: string; maxId?: string }>,
) => Promise<Page<Status>>;

/**
 * 手元の最新ステータスより新しいものを since_id で取得する。
 * 1ページに収まらないときは max_id で遡り、since_id に届くまで（最大 MAX_REFRESH_PAGES ページ）辿る。
 */
export const fetchNewerStatuses = async (
  fetchPage: FetchStatusesPage,
  existing: readonly Status[],
  pageLimit: number,
): Promise<StatusesRefresh> => {
  const newest = existing[0];
  if (newest === undefined) {
    const page = await fetchPage({});
    return { kind: 'replaced', items: page.items, cursor: page.nextMaxId };
  }
  const collected: Status[] = [];
  let maxId: string | undefined;
  for (let pageCount = 0; pageCount < MAX_REFRESH_PAGES; pageCount++) {
    const page = await fetchPage(maxId === undefined ? { sinceId: newest.id } : { sinceId: newest.id, maxId });
    collected.push(...page.items);
    if (page.items.length < pageLimit || page.nextMaxId === undefined) {
      return { kind: 'merged', newer: collected };
    }
    maxId = page.nextMaxId;
  }
  return { kind: 'replaced', items: collected, cursor: maxId };
};

export type FetchBlueskyPage = (cursor?: BlueskyCursor) => Promise<BlueskyTimelinePage>;

/**
 * Bluesky は since 系のパラメータが無いので、先頭から遡って手元のアイテムに行き当たるまで辿る。
 */
export const fetchNewerBluesky = async (
  fetchPage: FetchBlueskyPage,
  existing: readonly IoriBlueskyTimelineItemBody[],
): Promise<BlueskyRefresh> => {
  const newest = existing[0];
  const known = new Set(existing.map((item) => item.feedItemId));
  const collected: IoriBlueskyTimelineItemBody[] = [];
  let cursor: BlueskyCursor | undefined;
  for (let pageCount = 0; pageCount < MAX_REFRESH_PAGES; pageCount++) {
    const page = await fetchPage(cursor);
    if (newest === undefined) {
      return { kind: 'replaced', items: page.items, cursor: blueskyCursorOf(page) };
    }
    for (const item of page.items) {
      if (known.has(item.feedItemId) || item.indexedAt < newest.indexedAt) {
        return { kind: 'merged', newer: collected };
      }
      collected.push(item);
    }
    const next = blueskyCursorOf(page);
    if (next === undefined || page.items.length === 0) return { kind: 'merged', newer: collected };
    cursor = next;
  }
  return { kind: 'replaced', items: collected, cursor };
};

const prependNewer = <T>(
  existing: readonly T[],
  newer: readonly T[],
  keyOf: (item: T) => string,
): readonly T[] => {
  const seen = new Set(existing.map(keyOf));
  const added: T[] = [];
  for (const item of newer) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    added.push(item);
  }
  return added.length === 0 ? existing : [...added, ...existing];
};

export type RefreshedPaging = Readonly<{
  paging: HomeFeedPaging;
  /** 先頭に追加されたアイテム数。手元にあったアイテムを置き換えたときは undefined。 */
  newCount: number | undefined;
}>;

const shownKeysOf = (paging: HomeFeedPaging): ReadonlySet<string> =>
  new Set(
    mergeHomeFeed({
      statuses: paging.statuses,
      hasMoreStatuses: paging.nextMaxId !== undefined,
      bluesky: paging.bluesky.items,
      hasMoreBluesky: paging.bluesky.cursor !== undefined,
    }).map(homeItemKey),
  );

/**
 * 最新側の取得結果を手元のページングに反映する。
 * Bluesky が失敗したとき（bluesky === undefined）は手元の Bluesky をそのまま残す。
 */
export const pagingAfterRefresh = (
  prev: HomeFeedPaging,
  statuses: StatusesRefresh,
  bluesky: BlueskyRefresh | undefined,
): RefreshedPaging => {
  const nextStatuses = statuses.kind === 'merged'
    ? { statuses: prependNewer(prev.statuses, statuses.newer, (s) => s.id), nextMaxId: prev.nextMaxId }
    : { statuses: statuses.items, nextMaxId: statuses.cursor };
  const nextBluesky: BlueskySource = bluesky === undefined
    ? prev.bluesky
    : bluesky.kind === 'merged'
    ? {
      items: prependNewer(prev.bluesky.items, bluesky.newer, (item) => item.feedItemId),
      cursor: prev.bluesky.cursor,
    }
    : { items: bluesky.items, cursor: bluesky.cursor };
  // 空だった情報源の置き換えは「全部が新着」として数えられる。中身があった情報源の置き換えだけは数えられない
  const isReplaced = (statuses.kind === 'replaced' && prev.statuses.length > 0)
    || (bluesky?.kind === 'replaced' && prev.bluesky.items.length > 0);
  const paging: HomeFeedPaging = { ...nextStatuses, bluesky: nextBluesky };
  if (isReplaced) return { paging, newCount: undefined };
  const before = shownKeysOf(prev);
  const newCount = [...shownKeysOf(paging)].filter((key) => !before.has(key)).length;
  return { paging, newCount };
};
