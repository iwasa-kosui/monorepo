import type {
  IoriBlueskyAuthorFeedResponse,
  IoriBlueskyFollowListResponse,
  IoriBlueskyFollowResponse,
  IoriBlueskyLikedPostsResponse,
  IoriBlueskyProfileBody,
  IoriBlueskyUnfollowResponse,
} from '../../adaptor/routes/workerIoriBlueskyProfileRouter.ts';
import { isMastodonApiError, isUnprocessableError, requestUrl, toApiError } from './mastodonClient.ts';

export type BlueskyProfile = IoriBlueskyProfileBody;

export type BlueskyAuthorFeedPage = IoriBlueskyAuthorFeedResponse;

export type BlueskyLikedPostsPage = IoriBlueskyLikedPostsResponse;

export type BlueskyFollowListPage = IoriBlueskyFollowListResponse;

const PROFILES_PATH = '/api/iori/v1/bluesky/profiles';
const FOLLOWS_PATH = '/api/iori/v1/bluesky/follows';
const LIKED_POSTS_PATH = '/api/iori/v1/bluesky/liked-posts';
const OWN_PROFILE_PATH = '/api/iori/v1/bluesky/profile';
const LOGIN_FAILED_MESSAGE = 'Bluesky login failed';

const get = async <T>(path: string): Promise<T> => {
  const res = await fetch(path, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
  if (!res.ok) throw await toApiError(res);
  return await res.json() as T;
};

export const fetchBlueskyProfile = (actor: string): Promise<BlueskyProfile> =>
  get<BlueskyProfile>(`${PROFILES_PATH}/${encodeURIComponent(actor)}`);

export const fetchBlueskyAuthorFeed = (actor: string, cursor?: string): Promise<BlueskyAuthorFeedPage> =>
  get<BlueskyAuthorFeedPage>(requestUrl(`${PROFILES_PATH}/${encodeURIComponent(actor)}/feed`, { cursor }));

export const fetchBlueskyFollows = (actor: string, cursor?: string): Promise<BlueskyFollowListPage> =>
  get<BlueskyFollowListPage>(requestUrl(`${PROFILES_PATH}/${encodeURIComponent(actor)}/follows`, { cursor }));

export const fetchBlueskyFollowers = (actor: string, cursor?: string): Promise<BlueskyFollowListPage> =>
  get<BlueskyFollowListPage>(requestUrl(`${PROFILES_PATH}/${encodeURIComponent(actor)}/followers`, { cursor }));

export const fetchBlueskyLikedPosts = (cursor?: string): Promise<BlueskyLikedPostsPage> =>
  get<BlueskyLikedPostsPage>(requestUrl(LIKED_POSTS_PATH, { cursor }));

export const followBlueskyActor = async (
  did: string,
  followUri?: string,
): Promise<IoriBlueskyFollowResponse> => {
  const res = await fetch(FOLLOWS_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(followUri === undefined ? { did } : { did, followUri }),
  });
  if (!res.ok) throw await toApiError(res);
  return await res.json() as IoriBlueskyFollowResponse;
};

export const unfollowBlueskyActor = async (
  did: string,
  followUri?: string,
): Promise<IoriBlueskyUnfollowResponse> => {
  const res = await fetch(requestUrl(FOLLOWS_PATH, { did, followUri }), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (!res.ok) throw await toApiError(res);
  return await res.json() as IoriBlueskyUnfollowResponse;
};

export type OwnBlueskyProfile = Readonly<{
  did: string;
  handle: string;
  displayName: string | null;
  description: string | null;
  avatar: string | null;
  banner: string | null;
}>;

export type OwnBlueskyProfileSaveResult = Readonly<{ uri: string; cid: string }>;

export const fetchOwnBlueskyProfile = (): Promise<OwnBlueskyProfile> => get<OwnBlueskyProfile>(OWN_PROFILE_PATH);

export const updateOwnBlueskyProfile = async (body: FormData): Promise<OwnBlueskyProfileSaveResult> => {
  const res = await fetch(OWN_PROFILE_PATH, {
    method: 'PUT',
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
    body,
  });
  if (!res.ok) throw await toApiError(res);
  return await res.json() as OwnBlueskyProfileSaveResult;
};

export const ownBlueskyProfileSaveFailureMessage = (error: unknown): string =>
  isUnprocessableError(error) && error instanceof Error
    ? error.message
    : 'Bluesky のプロフィールを保存できませんでした';

export const blueskyProfileLoadFailureMessage = (error: unknown): string => {
  if (isMastodonApiError(error) && error.status === 404) return 'この Bluesky のアカウントは見つかりません';
  if (isMastodonApiError(error) && error.status === 409) return 'Bluesky の連携が無効です';
  return 'プロフィールを読み込めませんでした';
};

export const blueskyFeedNoticeMessage = (
  feed: Readonly<{ unavailable: 'blocked' | null; failed: boolean }>,
): string | null => {
  if (feed.unavailable === 'blocked') return 'ブロックしているか、ブロックされているため、投稿を表示できません';
  return feed.failed ? '投稿を読み込めませんでした' : null;
};

export const blueskyFollowFailureMessage = (error: unknown): string =>
  isMastodonApiError(error) && error.message === LOGIN_FAILED_MESSAGE
    ? 'Bluesky にログインできないため、操作できませんでした。'
    : 'フォローを変更できませんでした';

export const blueskyFollowListFailureMessage = (
  error: unknown,
  kind: 'follows' | 'followers',
  position: 'first' | 'more',
): string => {
  if (isMastodonApiError(error) && error.message === LOGIN_FAILED_MESSAGE) {
    return position === 'first'
      ? `Bluesky にログインできないため、${kind === 'follows' ? 'フォロー' : 'フォロワー'}を読み込めませんでした`
      : 'Bluesky にログインできないため、続きを読み込めませんでした';
  }
  if (isMastodonApiError(error) && error.status === 409) return 'Bluesky 連携が無効です';
  return position === 'first'
    ? `${kind === 'follows' ? 'フォロー' : 'フォロワー'}を読み込めませんでした`
    : '続きを読み込めませんでした';
};

export const blueskyLikedPostsFailureMessage = (error: unknown, kind: 'first' | 'more'): string => {
  if (isMastodonApiError(error) && error.message === LOGIN_FAILED_MESSAGE) {
    return kind === 'first'
      ? 'Bluesky にログインできないため、いいねした投稿を読み込めませんでした'
      : 'Bluesky にログインできないため、続きを読み込めませんでした';
  }
  if (isMastodonApiError(error) && error.status === 409) return 'Bluesky 連携が無効です';
  return kind === 'first' ? 'Bluesky でいいねした投稿を読み込めませんでした' : '続きを読み込めませんでした';
};

export const blueskyActorOfPath = (pathname: string): string | undefined => {
  const encoded = /^\/bluesky\/profile\/([^/]+)\/?$/.exec(pathname)?.[1];
  if (encoded === undefined) return undefined;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
};
