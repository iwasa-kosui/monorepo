import z from 'zod/v4';

import type { IoriBlueskyFeedPostsResponse } from '../../adaptor/routes/workerIoriBlueskyProfileRouter.ts';
import { BLUESKY_LOGIN_FAILED_ERROR, isMastodonApiError, requestUrl, toApiError } from './mastodonClient.ts';

const FEEDS_PATH = '/api/iori/v1/bluesky/feeds';
const FEED_POSTS_PATH = '/api/iori/v1/bluesky/feeds/posts';
const UNNAMED_FEED_LABEL = '名前を取得できなかったフィード';
const UNNAMED_LIST_LABEL = '名前を取得できなかったリスト';

const savedFeedsZodType = z.object({
  feeds: z.array(z.object({
    uri: z.string().min(1),
    kind: z.enum(['feed', 'list']),
    pinned: z.boolean(),
    displayName: z.string().optional(),
    avatar: z.string().optional(),
    description: z.string().optional(),
    creatorHandle: z.string().optional(),
  })),
});

export type BlueskySavedFeedView = z.infer<typeof savedFeedsZodType>['feeds'][number];

export type BlueskyFeedPostsPage = IoriBlueskyFeedPostsResponse;

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

export const blueskyFeedPostsFailureMessage = (error: unknown, kind: 'first' | 'more'): string => {
  if (isMastodonApiError(error) && error.message === BLUESKY_LOGIN_FAILED_ERROR) {
    return kind === 'first'
      ? 'Bluesky にログインできないため、投稿を読み込めませんでした'
      : 'Bluesky にログインできないため、続きを読み込めませんでした';
  }
  if (isMastodonApiError(error) && error.status === 409) return 'Bluesky 連携が無効です';
  return kind === 'first' ? '投稿を読み込めませんでした' : '続きを読み込めませんでした';
};
