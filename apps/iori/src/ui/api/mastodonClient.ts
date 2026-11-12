import type {
  Account,
  CredentialAccount,
  MediaAttachment,
  Notification,
  Relationship,
  Report,
  Status,
  Translation,
} from '../../adaptor/mastodon/entities.ts';
import { IORI_EMOJI_REACTION_TYPE } from '../../adaptor/mastodon/entities.ts';
import type {
  IoriRemoteContextResponse,
  IoriRemoteStatusesResponse,
} from '../../adaptor/routes/workerIoriActionsRouter.ts';
import type {
  IoriBlueskyLikeResponse,
  IoriBlueskyRepostResponse,
  IoriBlueskySearchActorsResponse,
  IoriBlueskySearchPostsResponse,
  IoriBlueskyStatusResponse,
  IoriBlueskyThreadResponse,
  IoriBlueskyTimelineResponse,
} from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import type { IoriDigestRequestResponse, IoriFeedSourceBody } from '../../adaptor/routes/workerIoriDigestRouter.ts';
import type { IoriSearchStatusesResponse } from '../../adaptor/routes/workerIoriSearchRouter.ts';
import type { IoriTimelineSummaryResponse } from '../../adaptor/routes/workerIoriSummaryRouter.ts';
import type { IoriXPostsRefreshResponse, IoriXPostsResponse } from '../../adaptor/routes/workerIoriXPostsRouter.ts';
import type { PostDestination } from '../../domain/post/postDestination.ts';

export type PageCursors = Readonly<{
  nextMaxId: string | undefined;
  prevMinId: string | undefined;
}>;

export type Page<T> = Readonly<
  {
    items: readonly T[];
  } & PageCursors
>;

export type PageParams = Readonly<{
  maxId?: string;
  sinceId?: string;
  minId?: string;
  limit?: number;
}>;

export type MastodonApiError = Error & Readonly<{ status: number; retryAfterSeconds?: number; code?: string }>;

export const isMastodonApiError = (error: unknown): error is MastodonApiError =>
  error instanceof Error && typeof (error as { status?: unknown }).status === 'number';

export const isUnauthorizedError = (error: unknown): boolean => isMastodonApiError(error) && error.status === 401;

export const isNotFoundError = (error: unknown): boolean => isMastodonApiError(error) && error.status === 404;

export const isUnprocessableError = (error: unknown): boolean => isMastodonApiError(error) && error.status === 422;

export const failureMessage = (action: string, error: unknown): string =>
  isMastodonApiError(error) ? `Failed to ${action}: ${error.message}` : `Failed to ${action}. Please try again.`;

export const BLUESKY_LOGIN_FAILED_ERROR = 'Bluesky login failed';

export const blueskyFailureMessage = (action: string, error: unknown): string =>
  isMastodonApiError(error) && error.message === BLUESKY_LOGIN_FAILED_ERROR
    ? 'Bluesky にログインできないため、操作できませんでした。'
    : failureMessage(action, error);

const queryOf = (url: string): URLSearchParams | undefined => {
  try {
    return new URL(url, 'http://localhost').searchParams;
  } catch {
    return undefined;
  }
};

export const parseLinkHeader = (header: string | null): PageCursors => {
  let nextMaxId: string | undefined;
  let prevMinId: string | undefined;
  if (header === null) return { nextMaxId, prevMinId };
  for (const match of header.matchAll(/<([^>]*)>([^<]*)/g)) {
    const url = match[1] ?? '';
    const params = match[2] ?? '';
    const rels = /;\s*rel\s*=\s*"?([^";,]*)"?/i.exec(params)?.[1]?.trim().split(/\s+/) ?? [];
    const query = queryOf(url);
    if (rels.includes('next')) nextMaxId = query?.get('max_id') ?? undefined;
    if (rels.includes('prev')) prevMinId = query?.get('min_id') ?? undefined;
  }
  return { nextMaxId, prevMinId };
};

export const parseRetryAfter = (header: string | null, now: Date): number | undefined => {
  if (header === null) return undefined;
  const value = header.trim();
  if (/^\d+$/.test(value)) return Number(value);
  if (!/^[A-Za-z]/.test(value)) return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : Math.max(0, Math.ceil((time - now.getTime()) / 1000));
};

export const toApiError = async (res: Response): Promise<MastodonApiError> => {
  const body: unknown = await res.json().catch(() => undefined);
  const message = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
    ? body.error
    : `HTTP ${res.status}`;
  const code = typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string'
    ? body.code
    : undefined;
  const retryAfterSeconds = parseRetryAfter(res.headers.get('Retry-After'), new Date());
  return Object.assign(
    new Error(message),
    { status: res.status },
    retryAfterSeconds === undefined ? {} : { retryAfterSeconds },
    code === undefined ? {} : { code },
  );
};

export type Query = Readonly<Record<string, string | number | boolean | readonly string[] | undefined>>;

export const requestUrl = (path: string, query: Query = {}): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'object') {
      for (const item of value) search.append(key, item);
    } else if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  const queryString = search.toString();
  return queryString.length > 0 ? `${path}?${queryString}` : path;
};

const request = async <T>(
  path: string,
  query: Query = {},
): Promise<Readonly<{ body: T; cursors: PageCursors }>> => {
  const res = await fetch(requestUrl(path, query), {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (!res.ok) throw await toApiError(res);
  return { body: await res.json() as T, cursors: parseLinkHeader(res.headers.get('Link')) };
};

const getPage = async <T>(path: string, query: Query = {}): Promise<Page<T>> => {
  const { body, cursors } = await request<T[]>(path, query);
  return { items: body, ...cursors };
};

const pageQuery = (params: PageParams): Query => ({
  max_id: params.maxId,
  since_id: params.sinceId,
  min_id: params.minId,
  limit: params.limit,
});

const HOME_TIMELINE_PATH = '/api/v1/timelines/home';

/** ホームタイムラインを一度に取得する件数（サーバー側の上限）。 */
export const HOME_TIMELINE_PAGE_LIMIT = 40;

const homePageQuery = (params: PageParams): Query => pageQuery({ limit: HOME_TIMELINE_PAGE_LIMIT, ...params });

export const homeTimelineUrl = (params: PageParams = {}): string =>
  requestUrl(HOME_TIMELINE_PATH, homePageQuery(params));

export const fetchHomeTimeline = (params: PageParams = {}): Promise<Page<Status>> =>
  getPage<Status>(HOME_TIMELINE_PATH, homePageQuery(params));

export type PublicTimelineScope = 'local' | 'remote';

export const fetchPublicTimeline = (
  scope: PublicTimelineScope,
  params: PageParams = {},
): Promise<Page<Status>> => getPage<Status>('/api/v1/timelines/public', { ...pageQuery(params), [scope]: true });

export const fetchStatus = async (id: string): Promise<Status> =>
  (await request<Status>(`/api/v1/statuses/${encodeURIComponent(id)}`)).body;

export type StatusContext = Readonly<{
  ancestors: readonly Status[];
  descendants: readonly Status[];
}>;

export const fetchStatusContext = async (id: string): Promise<StatusContext> =>
  (await request<StatusContext>(`/api/v1/statuses/${encodeURIComponent(id)}/context`)).body;

const VERIFY_CREDENTIALS_PATH = '/api/v1/accounts/verify_credentials';

export const verifyCredentialsUrl = (): string => requestUrl(VERIFY_CREDENTIALS_PATH);

export const fetchVerifyCredentials = async (): Promise<CredentialAccount> =>
  (await request<CredentialAccount>(VERIFY_CREDENTIALS_PATH)).body;

export const lookupAccount = async (acct: string): Promise<Account> =>
  (await request<Account>('/api/v1/accounts/lookup', { acct })).body;

export const fetchAccount = async (accountId: string): Promise<Account> =>
  (await request<Account>(`/api/v1/accounts/${encodeURIComponent(accountId)}`)).body;

export const fetchAccountStatuses = (
  accountId: string,
  params: PageParams & Readonly<{ excludeReblogs?: boolean }> = {},
): Promise<Page<Status>> =>
  getPage<Status>(`/api/v1/accounts/${encodeURIComponent(accountId)}/statuses`, {
    ...pageQuery(params),
    exclude_reblogs: params.excludeReblogs,
  });

export const fetchRelationships = async (accountIds: readonly string[]): Promise<readonly Relationship[]> =>
  (await request<Relationship[]>('/api/v1/accounts/relationships', { 'id[]': accountIds })).body;

// 3つの取得のうちログインが必要なのは relationships だけなので、401 を未ログイン、422（アクターを持たない利用者）を関係なしとみなす
export const fetchRelationshipOrSignedOut = async (accountId: string) => {
  try {
    const [relationship] = await fetchRelationships([accountId]);
    return {
      isLoggedIn: true,
      isFollowing: relationship?.following ?? false,
      isMuted: relationship?.muting ?? false,
      isBlocked: relationship?.blocking ?? false,
    };
  } catch (error) {
    if (isUnauthorizedError(error)) return { isLoggedIn: false, isFollowing: false, isMuted: false, isBlocked: false };
    if (isUnprocessableError(error)) return { isLoggedIn: true, isFollowing: false, isMuted: false, isBlocked: false };
    throw error;
  }
};

const FAVOURITES_PATH = '/api/v1/favourites';

export const favouritesUrl = (params: PageParams = {}): string => requestUrl(FAVOURITES_PATH, pageQuery(params));

export const fetchFavourites = (params: PageParams = {}): Promise<Page<Status>> =>
  getPage<Status>(FAVOURITES_PATH, pageQuery(params));

export const fetchFollowers = (accountId: string, params: PageParams = {}): Promise<Page<Account>> =>
  getPage<Account>(`/api/v1/accounts/${encodeURIComponent(accountId)}/followers`, pageQuery(params));

export const fetchFollowing = (accountId: string, params: PageParams = {}): Promise<Page<Account>> =>
  getPage<Account>(`/api/v1/accounts/${encodeURIComponent(accountId)}/following`, pageQuery(params));

export const NOTIFICATION_TYPES = ['favourite', 'mention', 'follow', 'reblog', IORI_EMOJI_REACTION_TYPE] as const;

const NOTIFICATIONS_PATH = '/api/v1/notifications';

const notificationsQuery = (types: readonly string[], params: PageParams): Query => ({
  ...pageQuery(params),
  'types[]': types,
});

export const notificationsUrl = (types: readonly string[], params: PageParams = {}): string =>
  requestUrl(NOTIFICATIONS_PATH, notificationsQuery(types, params));

export const fetchNotifications = (
  types: readonly string[],
  params: PageParams = {},
): Promise<Page<Notification>> => getPage<Notification>(NOTIFICATIONS_PATH, notificationsQuery(types, params));

export const ARTICLES_URL = '/api/iori/v1/articles';

const act = async <T>(method: 'POST' | 'PUT' | 'DELETE', path: string): Promise<T> => {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (!res.ok) throw await toApiError(res);
  return await res.json() as T;
};

const post = <T>(path: string): Promise<T> => act<T>('POST', path);

const statusActionPath = (id: string, action: string) => `/api/v1/statuses/${encodeURIComponent(id)}/${action}`;

const accountActionPath = (id: string, action: string) => `/api/v1/accounts/${encodeURIComponent(id)}/${action}`;

export const favourite = (id: string): Promise<Status> => post<Status>(statusActionPath(id, 'favourite'));

export const unfavourite = (id: string): Promise<Status> => post<Status>(statusActionPath(id, 'unfavourite'));

const reactionPath = (id: string, emoji: string) =>
  `/api/iori/v1/statuses/${encodeURIComponent(id)}/reactions/${encodeURIComponent(emoji)}`;

export const react = (id: string, emoji: string): Promise<Status> => act<Status>('PUT', reactionPath(id, emoji));

export const unreact = (id: string, emoji: string): Promise<Status> => act<Status>('DELETE', reactionPath(id, emoji));

export const fetchRemoteContext = (id: string): Promise<IoriRemoteContextResponse> =>
  post<IoriRemoteContextResponse>(`/api/iori/v1/statuses/${encodeURIComponent(id)}/remote-context`);

export const fetchRemoteStatuses = (accountId: string): Promise<IoriRemoteStatusesResponse> =>
  post<IoriRemoteStatusesResponse>(`/api/iori/v1/accounts/${encodeURIComponent(accountId)}/remote-statuses`);

export const reblog = (id: string): Promise<Status> => post<Status>(statusActionPath(id, 'reblog'));

export const unreblog = (id: string): Promise<Status> => post<Status>(statusActionPath(id, 'unreblog'));

export const translate = (id: string): Promise<Translation> => post<Translation>(statusActionPath(id, 'translate'));

export const follow = (accountId: string): Promise<Relationship> =>
  post<Relationship>(accountActionPath(accountId, 'follow'));

export const unfollow = (accountId: string): Promise<Relationship> =>
  post<Relationship>(accountActionPath(accountId, 'unfollow'));

export const mute = (accountId: string): Promise<Relationship> =>
  post<Relationship>(accountActionPath(accountId, 'mute'));

export const unmute = (accountId: string): Promise<Relationship> =>
  post<Relationship>(accountActionPath(accountId, 'unmute'));

export type ReportParams = Readonly<{
  account_id: string;
  category: Report['category'];
  comment: string;
  status_ids?: readonly string[];
}>;

export const report = async (params: ReportParams): Promise<Report> => {
  const res = await fetch('/api/v1/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ ...params, forward: true }),
  });
  if (!res.ok) throw await toApiError(res);
  return await res.json() as Report;
};

export const block = (accountId: string): Promise<Relationship> =>
  post<Relationship>(accountActionPath(accountId, 'block'));

export const unblock = (accountId: string): Promise<Relationship> =>
  post<Relationship>(accountActionPath(accountId, 'unblock'));

export const searchAccount = async (acct: string): Promise<Account | undefined> =>
  (await request<{ accounts: Account[] }>('/api/v2/search', { q: acct, resolve: true, type: 'accounts' }))
    .body.accounts[0];

export const saveNotificationsMarker = async (lastReadId: string): Promise<void> => {
  const res = await fetch('/api/v1/markers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ notifications: { last_read_id: lastReadId } }),
  });
  if (!res.ok) throw await toApiError(res);
};

export type CreateStatusParams = Readonly<{
  status: string;
  in_reply_to_id?: string;
  media_ids?: readonly string[];
  content_type: string;
  iori_destination?: PostDestination;
  visibility?: 'public' | 'unlisted' | 'private';
  spoiler_text?: string;
  sensitive?: boolean;
}>;

export const createStatus = async (params: CreateStatusParams): Promise<Status> => {
  const res = await fetch('/api/v1/statuses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(params),
  });
  if (!res.ok) throw await toApiError(res);
  return await res.json() as Status;
};

export const deleteStatus = async (id: string): Promise<Status> => {
  const res = await fetch(`/api/v1/statuses/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (!res.ok) throw await toApiError(res);
  return await res.json() as Status;
};

const send = async <T>(method: 'POST' | 'PUT' | 'PATCH', path: string, body: FormData): Promise<T> => {
  // multipart の境界を含む Content-Type は、ブラウザに任せる
  const res = await fetch(path, {
    method,
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
    body,
  });
  if (!res.ok) throw await toApiError(res);
  return await res.json() as T;
};

export const uploadMedia = (file: File, description?: string): Promise<MediaAttachment> => {
  const body = new FormData();
  body.append('file', file);
  if (description !== undefined) body.append('description', description);
  return send<MediaAttachment>('POST', '/api/v2/media', body);
};

export const updateMedia = (id: string, description: string): Promise<MediaAttachment> => {
  const body = new FormData();
  body.append('description', description);
  return send<MediaAttachment>('PUT', `/api/v1/media/${encodeURIComponent(id)}`, body);
};

export const updateAvatar = (file: File): Promise<CredentialAccount> => {
  const body = new FormData();
  body.append('avatar', file);
  return send<CredentialAccount>('PATCH', '/api/v1/accounts/update_credentials', body);
};

export type SearchStatusesResult = IoriSearchStatusesResponse;

export const searchStatuses = async (q: string, limit?: number): Promise<SearchStatusesResult> =>
  (await request<SearchStatusesResult>('/api/iori/v1/search/statuses', { q, limit })).body;

export const searchRemoteStatuses = async (url: string): Promise<readonly Status[]> =>
  (await request<{ statuses: Status[] }>('/api/v2/search', { q: url, resolve: true, type: 'statuses' }))
    .body.statuses;

export const fetchXPosts = async (): Promise<IoriXPostsResponse> =>
  (await request<IoriXPostsResponse>('/api/iori/v1/x-posts')).body;

export type XPostsRefreshResult = IoriXPostsRefreshResponse;

export const refreshXPosts = async (): Promise<XPostsRefreshResult> => {
  const res = await fetch('/api/iori/v1/x-posts/refresh', {
    method: 'POST',
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (!res.ok) throw await toApiError(res);
  return await res.json() as XPostsRefreshResult;
};

export type FeedSource = IoriFeedSourceBody;

export const fetchFeedSources = async (): Promise<readonly FeedSource[]> =>
  (await request<Readonly<{ sources: readonly FeedSource[] }>>('/api/iori/v1/feed-sources')).body.sources;

const sendFeedSourceJson = async (
  method: 'POST' | 'PATCH',
  path: string,
  body: Readonly<Record<string, unknown>>,
): Promise<FeedSource> => {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await toApiError(res);
  return (await res.json() as Readonly<{ source: FeedSource }>).source;
};

export const addXUserFeedSource = (username: string): Promise<FeedSource> =>
  sendFeedSourceJson('POST', '/api/iori/v1/feed-sources', { kind: 'x_user', username });

export const setFeedSourceEnabled = (feedSourceId: string, enabled: boolean): Promise<FeedSource> =>
  sendFeedSourceJson('PATCH', `/api/iori/v1/feed-sources/${encodeURIComponent(feedSourceId)}`, { enabled });

export type SummarizeTimelineBody = Readonly<{ q?: string; since?: string; until?: string }>;

export type TimelineSummary = IoriTimelineSummaryResponse;

export const summarizeTimeline = async (body: SummarizeTimelineBody): Promise<TimelineSummary> => {
  const res = await fetch('/api/iori/v1/timeline/summaries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await toApiError(res);
  return await res.json() as TimelineSummary;
};

export type DigestRequestResult = IoriDigestRequestResponse;

export const requestDigest = async (): Promise<DigestRequestResult> => {
  const res = await fetch('/api/iori/v1/digests', {
    method: 'POST',
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (!res.ok) throw await toApiError(res);
  return await res.json() as DigestRequestResult;
};

export type BlueskyTimelinePage = IoriBlueskyTimelineResponse;

const BLUESKY_TIMELINE_PATH = '/api/iori/v1/bluesky/timeline';

export const blueskyHomeTimelineUrl = (): string => requestUrl(BLUESKY_TIMELINE_PATH, { scope: 'home' });

export const fetchBlueskyTimeline = async (
  params: Readonly<{ before?: number; beforeId?: string; limit?: number; scope?: 'home' }> = {},
): Promise<BlueskyTimelinePage> => (await request<BlueskyTimelinePage>(BLUESKY_TIMELINE_PATH, params)).body;

export const fetchBlueskyHomeTimeline = (
  cursor?: Readonly<{ before: number; beforeId: string | null }>,
): Promise<BlueskyTimelinePage> =>
  fetchBlueskyTimeline({
    scope: 'home',
    ...(cursor === undefined ? {} : { before: cursor.before }),
    ...(cursor === undefined || cursor.beforeId === null ? {} : { beforeId: cursor.beforeId }),
  });

export type BlueskyPostThread = IoriBlueskyThreadResponse;

const BLUESKY_THREAD_PATH = '/api/iori/v1/bluesky/thread';

export const fetchBlueskyPostThread = async (uri: string): Promise<BlueskyPostThread> =>
  (await request<BlueskyPostThread>(BLUESKY_THREAD_PATH, { uri })).body;

export type BlueskyStatus = IoriBlueskyStatusResponse;

export const fetchBlueskyStatus = async (): Promise<BlueskyStatus> =>
  (await request<BlueskyStatus>('/api/iori/v1/bluesky/status')).body;

const BLUESKY_LIKES_PATH = '/api/iori/v1/bluesky/likes';

export const likeBlueskyPost = async (feedItemId: string): Promise<IoriBlueskyLikeResponse> => {
  const res = await fetch(BLUESKY_LIKES_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ feedItemId }),
  });
  if (!res.ok) throw await toApiError(res);
  return await res.json() as IoriBlueskyLikeResponse;
};

export const unlikeBlueskyPost = (feedItemId: string): Promise<IoriBlueskyLikeResponse> =>
  act<IoriBlueskyLikeResponse>('DELETE', requestUrl(BLUESKY_LIKES_PATH, { feedItemId }));

const BLUESKY_REPOSTS_PATH = '/api/iori/v1/bluesky/reposts';

export const repostBlueskyPost = async (feedItemId: string): Promise<IoriBlueskyRepostResponse> => {
  const res = await fetch(BLUESKY_REPOSTS_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ feedItemId }),
  });
  if (!res.ok) throw await toApiError(res);
  return await res.json() as IoriBlueskyRepostResponse;
};

export const undoRepostBlueskyPost = (feedItemId: string): Promise<IoriBlueskyRepostResponse> =>
  act<IoriBlueskyRepostResponse>('DELETE', requestUrl(BLUESKY_REPOSTS_PATH, { feedItemId }));

const BLUESKY_REPLIES_PATH = '/api/iori/v1/bluesky/replies';

export type BlueskyReplyResponse = Readonly<{ uri: string; cid: string }>;

export const replyToBlueskyPost = async (feedItemId: string, text: string): Promise<BlueskyReplyResponse> => {
  const res = await fetch(BLUESKY_REPLIES_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ feedItemId, text }),
  });
  if (!res.ok) throw await toApiError(res);
  return await res.json() as BlueskyReplyResponse;
};

const BLUESKY_QUOTES_PATH = '/api/iori/v1/bluesky/quotes';

export type BlueskyQuoteResponse = Readonly<{ uri: string; cid: string }>;

export const quoteBlueskyPost = async (uri: string, text: string): Promise<BlueskyQuoteResponse> => {
  const res = await fetch(BLUESKY_QUOTES_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ uri, text }),
  });
  if (!res.ok) throw await toApiError(res);
  return await res.json() as BlueskyQuoteResponse;
};

const postJson = async <T>(path: string, body: unknown): Promise<T> => {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await toApiError(res);
  return await res.json() as T;
};

export const likeBlueskyPostByUri = (uri: string): Promise<IoriBlueskyLikeResponse> =>
  postJson<IoriBlueskyLikeResponse>(BLUESKY_LIKES_PATH, { uri });

export const unlikeBlueskyPostByUri = (uri: string): Promise<IoriBlueskyLikeResponse> =>
  act<IoriBlueskyLikeResponse>('DELETE', requestUrl(BLUESKY_LIKES_PATH, { uri }));

export const repostBlueskyPostByUri = (uri: string): Promise<IoriBlueskyRepostResponse> =>
  postJson<IoriBlueskyRepostResponse>(BLUESKY_REPOSTS_PATH, { uri });

export const undoRepostBlueskyPostByUri = (uri: string): Promise<IoriBlueskyRepostResponse> =>
  act<IoriBlueskyRepostResponse>('DELETE', requestUrl(BLUESKY_REPOSTS_PATH, { uri }));

export const replyToBlueskyPostByUri = (uri: string, text: string): Promise<BlueskyReplyResponse> =>
  postJson<BlueskyReplyResponse>(BLUESKY_REPLIES_PATH, { uri, text });

export const markBlueskyNotificationsSeen = async (seenAt: string): Promise<void> => {
  const res = await fetch('/api/iori/v1/bluesky/notifications/seen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ seenAt }),
  });
  if (!res.ok) throw await toApiError(res);
};

const BLUESKY_SEARCH_POSTS_PATH = '/api/iori/v1/bluesky/search/posts';

export const searchBlueskyPosts = async (q: string, cursor?: string): Promise<IoriBlueskySearchPostsResponse> =>
  (await request<IoriBlueskySearchPostsResponse>(BLUESKY_SEARCH_POSTS_PATH, { q, cursor })).body;

const BLUESKY_SEARCH_ACTORS_PATH = '/api/iori/v1/bluesky/search/actors';

export const searchBlueskyActors = async (q: string, cursor?: string): Promise<IoriBlueskySearchActorsResponse> =>
  (await request<IoriBlueskySearchActorsResponse>(BLUESKY_SEARCH_ACTORS_PATH, { q, cursor })).body;
