import { RA } from '@iwasa-kosui/result';
import { z } from 'zod/v4';

import type { XUsername } from '../../domain/feedSource/xUsername.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import type { SafeFetcher } from '../http/safeFetch.ts';

const X_API_ORIGIN = 'https://api.x.com/2';
const MAX_RESULTS = 100;
// リダイレクトを辿ると Bearer トークンが転送先にも送られるため、辿らない
const FETCH_OPTIONS = { timeoutMs: 10_000, maxBytes: 2 * 1024 * 1024, maxRedirects: 0 } as const;

export type XApiError = Readonly<{ type: 'XApiError'; message: string; status?: number }>;

export type XPost = Readonly<{ id: string; text: string; createdAt: Date }>;

export type XApiClient = Readonly<{
  lookupUserId: (username: XUsername) => RA<string, XApiError>;
  fetchUserPosts: (
    query: Readonly<{ userId: string; sinceId?: string; startTime?: Instant }>,
  ) => RA<ReadonlyArray<XPost>, XApiError>;
}>;

const numericId = z.string().regex(/^\d+$/);

const userResponseZodType = z.object({ data: z.object({ id: numericId }) });

const postsResponseZodType = z.object({
  data: z.array(z.object({
    id: numericId,
    text: z.string(),
    created_at: z.iso.datetime().transform((value) => new Date(value)),
  })).optional(),
});

const xApiError = (message: string, status?: number): XApiError => ({
  type: 'XApiError',
  message,
  ...(status === undefined ? {} : { status }),
});

const toStartTime = (instant: Instant): string => new Date(instant).toISOString().replace(/\.\d{3}Z$/, 'Z');

type Deps = Readonly<{ safeFetcher: SafeFetcher; bearerToken: string }>;

export const createXApiClient = ({ safeFetcher, bearerToken }: Deps): XApiClient => {
  const get = async <T>(url: URL, zodType: z.ZodType<T>): RA<T, XApiError> => {
    const fetched = await safeFetcher.fetchText(url.href, {
      ...FETCH_OPTIONS,
      headers: { Authorization: `Bearer ${bearerToken}`, Accept: 'application/json' },
    });
    if (!fetched.ok) return RA.err(xApiError(`X API request failed: ${fetched.err.message}`, fetched.err.status));
    let json: unknown;
    try {
      json = JSON.parse(fetched.val.body ?? '');
    } catch {
      return RA.err(xApiError('X API returned a body that is not JSON.'));
    }
    const parsed = zodType.safeParse(json);
    return parsed.success
      ? RA.ok(parsed.data)
      : RA.err(xApiError(`X API returned an unexpected response: ${z.prettifyError(parsed.error)}`));
  };

  const lookupUserId = async (username: XUsername): RA<string, XApiError> => {
    const user = await get(new URL(`${X_API_ORIGIN}/users/by/username/${username}`), userResponseZodType);
    return user.ok ? RA.ok(user.val.data.id) : user;
  };

  const fetchUserPosts: XApiClient['fetchUserPosts'] = async ({ userId, sinceId, startTime }) => {
    const url = new URL(`${X_API_ORIGIN}/users/${userId}/tweets`);
    url.searchParams.set('max_results', String(MAX_RESULTS));
    url.searchParams.set('exclude', 'replies,retweets');
    url.searchParams.set('tweet.fields', 'created_at');
    if (sinceId !== undefined) url.searchParams.set('since_id', sinceId);
    else if (startTime !== undefined) url.searchParams.set('start_time', toStartTime(startTime));
    const posts = await get(url, postsResponseZodType);
    return posts.ok
      ? RA.ok((posts.val.data ?? []).map(({ id, text, created_at }) => ({ id, text, createdAt: created_at })))
      : posts;
  };

  return { lookupUserId, fetchUserPosts };
};
