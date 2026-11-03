import type {
  Account,
  CredentialAccount,
  Notification,
  Relationship,
  Status,
} from '../../adaptor/mastodon/entities.ts';

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

export type MastodonApiError = Error & Readonly<{ status: number }>;

export const isMastodonApiError = (error: unknown): error is MastodonApiError =>
  error instanceof Error && typeof (error as { status?: unknown }).status === 'number';

export const isUnauthorizedError = (error: unknown): boolean => isMastodonApiError(error) && error.status === 401;

export const isNotFoundError = (error: unknown): boolean => isMastodonApiError(error) && error.status === 404;

export const isUnprocessableError = (error: unknown): boolean => isMastodonApiError(error) && error.status === 422;

export const failureMessage = (action: string, error: unknown): string =>
  isMastodonApiError(error) ? `Failed to ${action}: ${error.message}` : `Failed to ${action}. Please try again.`;

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

const toApiError = async (res: Response): Promise<MastodonApiError> => {
  const body: unknown = await res.json().catch(() => undefined);
  const message = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
    ? body.error
    : `HTTP ${res.status}`;
  return Object.assign(new Error(message), { status: res.status });
};

type Query = Readonly<Record<string, string | number | boolean | readonly string[] | undefined>>;

const request = async <T>(
  path: string,
  query: Query = {},
): Promise<Readonly<{ body: T; cursors: PageCursors }>> => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'object') {
      for (const item of value) search.append(key, item);
    } else if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  const queryString = search.toString();
  const res = await fetch(queryString.length > 0 ? `${path}?${queryString}` : path, {
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

export const fetchHomeTimeline = (params: PageParams = {}): Promise<Page<Status>> =>
  getPage<Status>('/api/v1/timelines/home', pageQuery(params));

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

export const fetchVerifyCredentials = async (): Promise<CredentialAccount> =>
  (await request<CredentialAccount>('/api/v1/accounts/verify_credentials')).body;

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
    return { isLoggedIn: true, isFollowing: relationship?.following ?? false, isMuted: relationship?.muting ?? false };
  } catch (error) {
    if (isUnauthorizedError(error)) return { isLoggedIn: false, isFollowing: false, isMuted: false };
    if (isUnprocessableError(error)) return { isLoggedIn: true, isFollowing: false, isMuted: false };
    throw error;
  }
};

export const fetchFavourites = (params: PageParams = {}): Promise<Page<Status>> =>
  getPage<Status>('/api/v1/favourites', pageQuery(params));

export const fetchFollowers = (accountId: string, params: PageParams = {}): Promise<Page<Account>> =>
  getPage<Account>(`/api/v1/accounts/${encodeURIComponent(accountId)}/followers`, pageQuery(params));

export const fetchFollowing = (accountId: string, params: PageParams = {}): Promise<Page<Account>> =>
  getPage<Account>(`/api/v1/accounts/${encodeURIComponent(accountId)}/following`, pageQuery(params));

export const fetchNotifications = (
  types: readonly string[],
  params: PageParams = {},
): Promise<Page<Notification>> =>
  getPage<Notification>('/api/v1/notifications', { ...pageQuery(params), 'types[]': types });

const post = async <T>(path: string): Promise<T> => {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (!res.ok) throw await toApiError(res);
  return await res.json() as T;
};

const statusActionPath = (id: string, action: string) => `/api/v1/statuses/${encodeURIComponent(id)}/${action}`;

const accountActionPath = (id: string, action: string) => `/api/v1/accounts/${encodeURIComponent(id)}/${action}`;

export const favourite = (id: string): Promise<Status> => post<Status>(statusActionPath(id, 'favourite'));

export const unfavourite = (id: string): Promise<Status> => post<Status>(statusActionPath(id, 'unfavourite'));

export const reblog = (id: string): Promise<Status> => post<Status>(statusActionPath(id, 'reblog'));

export const unreblog = (id: string): Promise<Status> => post<Status>(statusActionPath(id, 'unreblog'));

export const follow = (accountId: string): Promise<Relationship> =>
  post<Relationship>(accountActionPath(accountId, 'follow'));

export const unfollow = (accountId: string): Promise<Relationship> =>
  post<Relationship>(accountActionPath(accountId, 'unfollow'));

export const mute = (accountId: string): Promise<Relationship> =>
  post<Relationship>(accountActionPath(accountId, 'mute'));

export const unmute = (accountId: string): Promise<Relationship> =>
  post<Relationship>(accountActionPath(accountId, 'unmute'));

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
