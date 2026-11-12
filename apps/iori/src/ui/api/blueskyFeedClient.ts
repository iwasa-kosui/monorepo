import z from 'zod/v4';

import type {
  IoriBlueskyFeedPostsResponse,
  IoriBlueskyListMembersResponse,
} from '../../adaptor/routes/workerIoriBlueskyProfileRouter.ts';
import type { BlueskyFeedKind } from '../../domain/blueskyFeed/blueskyFeedUri.ts';
import { BLUESKY_LOGIN_FAILED_ERROR, isMastodonApiError, requestUrl, toApiError } from './mastodonClient.ts';

const FEEDS_PATH = '/api/iori/v1/bluesky/feeds';
const FEED_POSTS_PATH = '/api/iori/v1/bluesky/feeds/posts';
const FEED_INFO_PATH = '/api/iori/v1/bluesky/feeds/info';
const FEED_RESOLVE_PATH = '/api/iori/v1/bluesky/feeds/resolve';
const LIST_MEMBERS_PATH = '/api/iori/v1/bluesky/lists/members';
const PROFILES_PATH = '/api/iori/v1/bluesky/profiles';
const FEED_PROVIDER_FAILED_ERROR = 'Feed provider failed';
const UNNAMED_FEED_LABEL = '名前を取得できなかったフィード';
const UNNAMED_LIST_LABEL = '名前を取得できなかったリスト';

const savedFeedZodType = z.object({
  uri: z.string().min(1),
  kind: z.enum(['feed', 'list']),
  pinned: z.boolean(),
  displayName: z.string().optional(),
  avatar: z.string().optional(),
  description: z.string().optional(),
  creatorHandle: z.string().optional(),
});
const savedFeedsZodType = z.object({ feeds: z.array(savedFeedZodType) });
const resolvedZodType = z.object({ uri: z.string().min(1) });
const feedsPageZodType = z.object({ feeds: z.array(savedFeedZodType), cursor: z.string().nullable() });
const listsPageZodType = z.object({ lists: z.array(savedFeedZodType), cursor: z.string().nullable() });

export type BlueskySavedFeedView = z.infer<typeof savedFeedZodType>;

export type BlueskyFeedPostsPage = IoriBlueskyFeedPostsResponse;

export type BlueskyListMembersPage = IoriBlueskyListMembersResponse;

export type BlueskyFeedViewsPage = Readonly<{ items: readonly BlueskySavedFeedView[]; cursor: string | null }>;

const getJson = async (path: string): Promise<unknown> => {
  const res = await fetch(path, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
  if (!res.ok) throw await toApiError(res);
  return await res.json();
};

export const fetchBlueskySavedFeeds = async (): Promise<readonly BlueskySavedFeedView[]> => {
  const parsed = savedFeedsZodType.safeParse(await getJson(FEEDS_PATH));
  if (!parsed.success) throw new Error('Unexpected saved feeds response');
  return parsed.data.feeds;
};

export const fetchBlueskyFeedPosts = async (uri: string, cursor?: string): Promise<BlueskyFeedPostsPage> =>
  await getJson(requestUrl(FEED_POSTS_PATH, { uri, cursor })) as BlueskyFeedPostsPage;

export const fetchBlueskyFeedInfo = async (uri: string): Promise<BlueskySavedFeedView> => {
  const parsed = savedFeedZodType.safeParse(await getJson(requestUrl(FEED_INFO_PATH, { uri })));
  if (!parsed.success) throw new Error('Unexpected feed info response');
  return parsed.data;
};

export const resolveBlueskyFeedUrl = async (url: string): Promise<string> => {
  const parsed = resolvedZodType.safeParse(await getJson(requestUrl(FEED_RESOLVE_PATH, { url })));
  if (!parsed.success) throw new Error('Unexpected feed resolve response');
  return parsed.data.uri;
};

export const fetchBlueskyListMembers = async (uri: string, cursor?: string): Promise<BlueskyListMembersPage> =>
  await getJson(requestUrl(LIST_MEMBERS_PATH, { uri, cursor })) as BlueskyListMembersPage;

export const fetchBlueskyActorFeeds = async (actor: string, cursor?: string): Promise<BlueskyFeedViewsPage> => {
  const parsed = feedsPageZodType.safeParse(
    await getJson(requestUrl(`${PROFILES_PATH}/${encodeURIComponent(actor)}/feeds`, { cursor })),
  );
  if (!parsed.success) throw new Error('Unexpected actor feeds response');
  return { items: parsed.data.feeds, cursor: parsed.data.cursor };
};

export const fetchBlueskyActorLists = async (actor: string, cursor?: string): Promise<BlueskyFeedViewsPage> => {
  const parsed = listsPageZodType.safeParse(
    await getJson(requestUrl(`${PROFILES_PATH}/${encodeURIComponent(actor)}/lists`, { cursor })),
  );
  if (!parsed.success) throw new Error('Unexpected actor lists response');
  return { items: parsed.data.lists, cursor: parsed.data.cursor };
};

export const blueskyFeedLabel = (feed: BlueskySavedFeedView): string => {
  if (feed.displayName !== undefined && feed.displayName !== '') return feed.displayName;
  return feed.kind === 'list' ? UNNAMED_LIST_LABEL : UNNAMED_FEED_LABEL;
};

export const blueskySavedFeedsFailureMessage = (error: unknown): string => {
  if (isMastodonApiError(error) && error.message === BLUESKY_LOGIN_FAILED_ERROR) {
    return 'Bluesky にログインできないため、保存したフィードとリストを読み込めませんでした';
  }
  if (isMastodonApiError(error) && error.status === 409) return 'Bluesky 連携が無効です';
  return '保存したフィードとリストを読み込めませんでした';
};

export const blueskyFeedPostsFailureMessage = (
  error: unknown,
  kind: 'first' | 'more',
  feedKind: BlueskyFeedKind,
): string => {
  if (isMastodonApiError(error) && error.message === BLUESKY_LOGIN_FAILED_ERROR) {
    return kind === 'first'
      ? 'Bluesky にログインできないため、投稿を読み込めませんでした'
      : 'Bluesky にログインできないため、続きを読み込めませんでした';
  }
  if (isMastodonApiError(error) && error.status === 409) return 'Bluesky 連携が無効です';
  if (isMastodonApiError(error) && error.status === 404) {
    return feedKind === 'list'
      ? 'このリストは見つかりませんでした。削除された可能性があります。'
      : 'このフィードは見つかりませんでした。削除された可能性があります。';
  }
  if (isMastodonApiError(error) && error.message === FEED_PROVIDER_FAILED_ERROR) {
    return 'フィードの提供元から取得できませんでした。時間をおいて読み込み直してください。';
  }
  return kind === 'first' ? '投稿を読み込めませんでした' : '続きを読み込めませんでした';
};

export const blueskyFeedInfoFailureMessage = (error: unknown): string => {
  if (isMastodonApiError(error) && error.message === BLUESKY_LOGIN_FAILED_ERROR) {
    return 'Bluesky にログインできないため、フィードやリストを開けませんでした';
  }
  if (isMastodonApiError(error) && error.status === 409) return 'Bluesky 連携が無効です';
  if (isMastodonApiError(error) && error.status === 404) return 'このフィードやリストは見つかりません';
  return 'フィードやリストを開けませんでした';
};

export const blueskyFeedUrlFailureMessage = (error: unknown): string => {
  if (isMastodonApiError(error) && error.status === 400) {
    return 'bsky.app のフィードかリストの URL を入力してください';
  }
  return blueskyFeedInfoFailureMessage(error);
};

export const blueskyListMembersFailureMessage = (error: unknown, kind: 'first' | 'more'): string => {
  if (isMastodonApiError(error) && error.message === BLUESKY_LOGIN_FAILED_ERROR) {
    return kind === 'first'
      ? 'Bluesky にログインできないため、メンバーを読み込めませんでした'
      : 'Bluesky にログインできないため、続きを読み込めませんでした';
  }
  if (isMastodonApiError(error) && error.status === 409) return 'Bluesky 連携が無効です';
  if (isMastodonApiError(error) && error.status === 404) {
    return 'このリストは見つかりませんでした。削除された可能性があります。';
  }
  return kind === 'first' ? 'メンバーを読み込めませんでした' : '続きを読み込めませんでした';
};

const actorCollectionFailureMessage = (kind: 'feeds' | 'lists', error: unknown, position: 'first' | 'more'): string => {
  const noun = kind === 'feeds' ? 'フィード' : 'リスト';
  if (isMastodonApiError(error) && error.message === BLUESKY_LOGIN_FAILED_ERROR) {
    return position === 'first'
      ? `Bluesky にログインできないため、${noun}を読み込めませんでした`
      : 'Bluesky にログインできないため、続きを読み込めませんでした';
  }
  if (isMastodonApiError(error) && error.status === 409) return 'Bluesky 連携が無効です';
  return position === 'first' ? `${noun}を読み込めませんでした` : '続きを読み込めませんでした';
};

export const blueskyActorFeedsFailureMessage = (error: unknown, position: 'first' | 'more'): string =>
  actorCollectionFailureMessage('feeds', error, position);

export const blueskyActorListsFailureMessage = (error: unknown, position: 'first' | 'more'): string =>
  actorCollectionFailureMessage('lists', error, position);
