import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { BlueskyPostStats, BlueskyPostStatsResolver } from '../../domain/aiAgentBot/aiAgentBotMaterial.ts';
import type { SafeFetcher } from '../http/safeFetch.ts';

/** ログインせずに読める Bluesky の公開 AppView。bot は利用者の Bluesky の資格情報を使わない */
export const BLUESKY_PUBLIC_APPVIEW = 'https://public.api.bsky.app';

/** app.bsky.feed.getPosts が 1 回に受け付ける URI の数 */
export const GET_POSTS_MAX_URIS = 25;

const FETCH_OPTIONS = {
  timeoutMs: 10_000,
  maxBytes: 1024 * 1024,
  maxRedirects: 0,
  acceptContentType: (contentType: string | undefined) => contentType === undefined || /json/i.test(contentType),
} as const;

const count = z.number().int().nonnegative().catch(0);

const responseZodType = z.object({
  posts: z.array(z.looseObject({
    uri: z.string().min(1),
    likeCount: count.optional(),
    repostCount: count.optional(),
    replyCount: count.optional(),
    quoteCount: count.optional(),
  })),
});

const chunks = <T>(items: readonly T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
};

/**
 * 公開 AppView の app.bsky.feed.getPosts で、投稿のいまの反応の数を読む。
 * 読めなかった分は結果に含めないだけで、エラーにはしない（話題の投稿が少し減るだけなので）。
 */
export const createBlueskyPublicPostStatsResolver = (
  deps: Readonly<{ safeFetcher: Pick<SafeFetcher, 'fetchText'> }>,
): BlueskyPostStatsResolver => ({
  resolve: async (uris) => {
    const stats = new Map<string, BlueskyPostStats>();
    for (const batch of chunks([...new Set(uris)], GET_POSTS_MAX_URIS)) {
      const query = batch.map((uri) => `uris=${encodeURIComponent(uri)}`).join('&');
      const fetched = await deps.safeFetcher.fetchText(
        `${BLUESKY_PUBLIC_APPVIEW}/xrpc/app.bsky.feed.getPosts?${query}`,
        FETCH_OPTIONS,
      );
      if (!fetched.ok || fetched.val.status !== 200 || fetched.val.body === undefined) {
        console.warn('iori ai agent bot: failed to read Bluesky post stats.', {
          error: fetched.ok ? `HTTP ${fetched.val.status}` : fetched.err.message,
        });
        continue;
      }
      let body: unknown;
      try {
        body = JSON.parse(fetched.val.body);
      } catch {
        continue;
      }
      const parsed = responseZodType.safeParse(body);
      if (!parsed.success) continue;
      for (const post of parsed.data.posts) {
        stats.set(post.uri, {
          uri: post.uri,
          likeCount: post.likeCount ?? 0,
          repostCount: post.repostCount ?? 0,
          replyCount: post.replyCount ?? 0,
          quoteCount: post.quoteCount ?? 0,
        });
      }
    }
    return RA.ok(stats);
  },
});
