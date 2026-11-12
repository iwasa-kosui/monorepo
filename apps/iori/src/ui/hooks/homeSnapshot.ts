import type { CredentialAccount, Status } from '../../adaptor/mastodon/entities.ts';
import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { type BlueskyCursor, type HomeFeedPaging, type HomeItem, homeItemKey, mergeHomeFeed } from './homeFeed.ts';

/** どこまで読んだか: 画面上端に見えているアイテムと、その上端の画面内位置。 */
export type ReadingAnchor = Readonly<{ key: string; offset: number }>;

export type HomeSnapshot = Readonly<{
  savedAt: number;
  me: CredentialAccount;
  paging: HomeFeedPaging;
  anchor: ReadingAnchor | undefined;
}>;

const SNAPSHOT_VERSION = 2;
const KEY_PREFIX = `iori:home-snapshot:v${SNAPSHOT_VERSION}:`;

/** これより古いスナップショットは読み捨てる。 */
export const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** 読んでいる位置より下に残しておくアイテム数。 */
const KEEP_BELOW_ANCHOR = 20;
/** 先頭で読んでいるときに残しておくアイテム数。 */
const KEEP_AT_TOP = 40;
/** 保存するアイテム数の上限（localStorage の容量対策）。 */
export const SNAPSHOT_MAX_ITEMS = 300;

const lastOf = <T>(items: readonly T[]): T | undefined => items[items.length - 1];

const trimSource = <T>(
  all: readonly T[],
  kept: ReadonlySet<T>,
): readonly T[] => {
  const trimmed = all.filter((item) => kept.has(item));
  // 何も残らないとカーソルを作れないので、少なくとも最新の1件は残す
  return trimmed.length === 0 && all.length > 0 ? all.slice(0, 1) : trimmed;
};

/**
 * 保存するために、読んでいる位置より少し下までにページングを切り詰める。
 * 切り詰めたソースは、残した最後のアイテムを次のカーソルにすることで、復元後も続きから読み込める。
 */
export const trimPagingForSnapshot = (
  paging: HomeFeedPaging,
  anchorKey: string | undefined,
  maxItems: number = SNAPSHOT_MAX_ITEMS,
): HomeFeedPaging => {
  const merged = mergeHomeFeed({
    statuses: paging.statuses,
    hasMoreStatuses: paging.nextMaxId !== undefined,
    bluesky: paging.bluesky.items,
    hasMoreBluesky: paging.bluesky.cursor !== undefined,
  });
  const anchorIndex = anchorKey === undefined ? -1 : merged.findIndex((item) => homeItemKey(item) === anchorKey);
  const keepCount = Math.min(
    maxItems,
    anchorIndex < 0 ? KEEP_AT_TOP : anchorIndex + 1 + KEEP_BELOW_ANCHOR,
  );
  const keptItems: readonly HomeItem[] = merged.slice(0, keepCount);
  const keptStatuses = new Set(keptItems.flatMap((item) => item.kind === 'status' ? [item.status] : []));
  const keptBluesky = new Set(keptItems.flatMap((item) => item.kind === 'bluesky' ? [item.item] : []));

  const statuses = trimSource(paging.statuses, keptStatuses);
  const blueskyItems = trimSource<IoriBlueskyTimelineItemBody>(paging.bluesky.items, keptBluesky);

  const lastStatus = lastOf(statuses);
  const nextMaxId = statuses.length === paging.statuses.length ? paging.nextMaxId : lastStatus?.id;
  const lastBluesky = lastOf(blueskyItems);
  const blueskyCursor: BlueskyCursor | undefined =
    blueskyItems.length === paging.bluesky.items.length || lastBluesky === undefined
      ? paging.bluesky.cursor
      : { before: lastBluesky.indexedAt, beforeId: lastBluesky.feedItemId };

  return { statuses, nextMaxId, bluesky: { items: blueskyItems, cursor: blueskyCursor } };
};

const containsKey = (paging: HomeFeedPaging, key: string): boolean =>
  paging.statuses.some((status) => status.id === key)
  || paging.bluesky.items.some((item) => `bluesky:${item.feedItemId}` === key);

export const snapshotOf = (
  input: Readonly<{ me: CredentialAccount; paging: HomeFeedPaging; anchor: ReadingAnchor | undefined }>,
  now: number,
  maxItems: number = SNAPSHOT_MAX_ITEMS,
): HomeSnapshot => {
  const paging = trimPagingForSnapshot(input.paging, input.anchor?.key, maxItems);
  const anchor = input.anchor !== undefined && containsKey(paging, input.anchor.key) ? input.anchor : undefined;
  return { savedAt: now, me: input.me, paging, anchor };
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string';

const isBlueskyCursor = (value: unknown): value is BlueskyCursor =>
  isRecord(value)
  && typeof value.before === 'number'
  && (value.beforeId === null || typeof value.beforeId === 'string');

const isAnchor = (value: unknown): value is ReadingAnchor =>
  isRecord(value) && typeof value.key === 'string' && typeof value.offset === 'number'
  && Number.isFinite(value.offset);

const isStatusLike = (value: unknown): value is Status =>
  isRecord(value) && typeof value.id === 'string' && typeof value.created_at === 'string';

const isBlueskyItemLike = (value: unknown): value is IoriBlueskyTimelineItemBody =>
  isRecord(value) && typeof value.feedItemId === 'string' && typeof value.indexedAt === 'number';

/** localStorage から読んだ値を検査して、壊れていれば undefined にする。 */
export const parseSnapshot = (value: unknown, now: number): HomeSnapshot | undefined => {
  if (!isRecord(value)) return undefined;
  const { savedAt, me, paging, anchor } = value;
  if (typeof savedAt !== 'number' || now - savedAt < 0 || now - savedAt >= SNAPSHOT_MAX_AGE_MS) return undefined;
  if (!isRecord(me) || typeof me.id !== 'string') return undefined;
  if (!isRecord(paging) || !Array.isArray(paging.statuses) || !isOptionalString(paging.nextMaxId)) return undefined;
  if (!paging.statuses.every(isStatusLike)) return undefined;
  const { bluesky } = paging;
  if (!isRecord(bluesky) || !Array.isArray(bluesky.items) || !bluesky.items.every(isBlueskyItemLike)) {
    return undefined;
  }
  if (bluesky.cursor !== undefined && !isBlueskyCursor(bluesky.cursor)) return undefined;
  if (anchor !== undefined && !isAnchor(anchor)) return undefined;
  return {
    savedAt,
    me: me as CredentialAccount,
    paging: {
      statuses: paging.statuses,
      nextMaxId: paging.nextMaxId,
      bluesky: { items: bluesky.items, cursor: bluesky.cursor },
    },
    anchor,
  };
};

const currentUserId = (): string | undefined => {
  try {
    const userId = document.getElementById('root')?.dataset.userId;
    return userId === undefined || userId === '' ? undefined : userId;
  } catch {
    return undefined;
  }
};

const storageKey = (): string | undefined => {
  const userId = currentUserId();
  return userId === undefined ? undefined : `${KEY_PREFIX}${userId}`;
};

export const readHomeSnapshot = (now: number = Date.now()): HomeSnapshot | undefined => {
  try {
    const key = storageKey();
    if (key === undefined) return undefined;
    const raw = localStorage.getItem(key);
    if (raw === null) return undefined;
    const snapshot = parseSnapshot(JSON.parse(raw), now);
    if (snapshot === undefined) localStorage.removeItem(key);
    return snapshot;
  } catch {
    return undefined;
  }
};

export const writeHomeSnapshot = (
  input: Readonly<{ me: CredentialAccount; paging: HomeFeedPaging; anchor: ReadingAnchor | undefined }>,
  now: number = Date.now(),
): void => {
  const key = storageKey();
  if (key === undefined) return;
  // 容量超過のときは件数を減らして書き直す
  for (const maxItems of [SNAPSHOT_MAX_ITEMS, 100, KEEP_AT_TOP]) {
    try {
      localStorage.setItem(key, JSON.stringify(snapshotOf(input, now, maxItems)));
      return;
    } catch {
      continue;
    }
  }
};

export const clearHomeSnapshot = (): void => {
  try {
    const key = storageKey();
    if (key !== undefined) localStorage.removeItem(key);
  } catch {
    return;
  }
};
