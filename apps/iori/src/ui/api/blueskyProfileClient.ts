import type {
  IoriBlueskyAuthorFeedResponse,
  IoriBlueskyFollowResponse,
  IoriBlueskyProfileBody,
  IoriBlueskyUnfollowResponse,
} from '../../adaptor/routes/workerIoriBlueskyProfileRouter.ts';
import { isMastodonApiError, requestUrl, toApiError } from './mastodonClient.ts';

export type BlueskyProfile = IoriBlueskyProfileBody;

export type BlueskyAuthorFeedPage = IoriBlueskyAuthorFeedResponse;

const PROFILES_PATH = '/api/iori/v1/bluesky/profiles';
const FOLLOWS_PATH = '/api/iori/v1/bluesky/follows';
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

export const followBlueskyActor = async (did: string): Promise<IoriBlueskyFollowResponse> => {
  const res = await fetch(FOLLOWS_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ did }),
  });
  if (!res.ok) throw await toApiError(res);
  return await res.json() as IoriBlueskyFollowResponse;
};

export const unfollowBlueskyActor = async (did: string): Promise<IoriBlueskyUnfollowResponse> => {
  const res = await fetch(requestUrl(FOLLOWS_PATH, { did }), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (!res.ok) throw await toApiError(res);
  return await res.json() as IoriBlueskyUnfollowResponse;
};

export const blueskyProfileLoadFailureMessage = (error: unknown): string =>
  isMastodonApiError(error) && error.status === 404
    ? 'この Bluesky のアカウントは見つかりません'
    : 'プロフィールを読み込めませんでした';

export const blueskyFollowFailureMessage = (error: unknown): string =>
  isMastodonApiError(error) && error.message === LOGIN_FAILED_MESSAGE
    ? 'Bluesky にログインできないため、操作できませんでした。'
    : 'フォローを変更できませんでした';

export const blueskyActorOfPath = (pathname: string): string | undefined => {
  const encoded = /^\/bluesky\/profile\/([^/]+)\/?$/.exec(pathname)?.[1];
  if (encoded === undefined) return undefined;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
};
