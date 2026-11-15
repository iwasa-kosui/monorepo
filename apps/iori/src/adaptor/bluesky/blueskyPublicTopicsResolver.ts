import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import {
  blueskyPostWebUrl,
  type BlueskyTopicPost,
  type BlueskyTrend,
  blueskyTrendFeedUri,
  type BlueskyTrendPostsResolver,
  type BlueskyTrendsResolver,
} from '../../domain/aiAgentBot/aiAgentBotMaterial.ts';
import type { SafeFetcher } from '../http/safeFetch.ts';

/** ログインせずに読める Bluesky の公開 AppView。bot は利用者の Bluesky の資格情報を使わない */
export const BLUESKY_PUBLIC_APPVIEW = 'https://public.api.bsky.app';

const FETCH_OPTIONS = {
  timeoutMs: 10_000,
  maxBytes: 2 * 1024 * 1024,
  maxRedirects: 0,
  acceptContentType: (contentType: string | undefined) => contentType === undefined || /json/i.test(contentType),
} as const;

const optionalText = z.string().min(1).nullish().catch(null);
const optionalCount = z.number().int().nonnegative().nullish().catch(null);

const trendsZodType = z.object({
  trends: z.array(
    z.looseObject({
      topic: z.string().min(1),
      displayName: z.string().min(1),
      description: optionalText,
      link: optionalText,
      postCount: optionalCount,
      status: optionalText,
      category: optionalText,
    }).nullable().catch(null),
  ),
});

const feedZodType = z.object({
  feed: z.array(
    z.looseObject({
      post: z.looseObject({
        uri: z.string().min(1),
        author: z.looseObject({ handle: z.string().min(1), displayName: optionalText }),
        record: z.looseObject({ text: z.string().catch(''), createdAt: optionalText }),
        likeCount: optionalCount,
        repostCount: optionalCount,
      }),
    }).nullable().catch(null),
  ),
});

const getJson = async (safeFetcher: Pick<SafeFetcher, 'fetchText'>, path: string): Promise<unknown> => {
  const fetched = await safeFetcher.fetchText(`${BLUESKY_PUBLIC_APPVIEW}${path}`, FETCH_OPTIONS);
  if (!fetched.ok || fetched.val.status !== 200 || fetched.val.body === undefined) {
    console.warn('iori ai agent bot: failed to read Bluesky public AppView.', {
      path: path.split('?')[0],
      error: fetched.ok ? `HTTP ${fetched.val.status}` : fetched.err.message,
    });
    return undefined;
  }
  try {
    return JSON.parse(fetched.val.body);
  } catch {
    return undefined;
  }
};

/** Bluesky 全体でいま話題になっていることを、公開 AppView の getTrends で読む。読めなければ空にする */
export const createBlueskyPublicTrendsResolver = (
  deps: Readonly<{ safeFetcher: Pick<SafeFetcher, 'fetchText'> }>,
): BlueskyTrendsResolver => ({
  resolve: async (limit) => {
    const parsed = trendsZodType.safeParse(
      await getJson(deps.safeFetcher, `/xrpc/app.bsky.unspecced.getTrends?limit=${limit}`),
    );
    if (!parsed.success) return RA.ok([]);
    return RA.ok(
      parsed.data.trends.flatMap((trend): BlueskyTrend[] =>
        trend === null ? [] : [{
          topic: trend.topic,
          displayName: trend.displayName,
          description: trend.description ?? null,
          postCount: trend.postCount ?? null,
          status: trend.status ?? null,
          category: trend.category ?? null,
          feedUri: trend.link === null || trend.link === undefined ? null : blueskyTrendFeedUri(trend.link),
        }]
      ).slice(0, limit),
    );
  },
});

/** 話題の投稿を集めたフィードを、公開 AppView の getFeed で読む。読めなければ空にする */
export const createBlueskyPublicTrendPostsResolver = (
  deps: Readonly<{ safeFetcher: Pick<SafeFetcher, 'fetchText'> }>,
): BlueskyTrendPostsResolver => ({
  resolve: async ({ feedUri, limit }) => {
    const parsed = feedZodType.safeParse(
      await getJson(
        deps.safeFetcher,
        `/xrpc/app.bsky.feed.getFeed?feed=${encodeURIComponent(feedUri)}&limit=${limit}`,
      ),
    );
    if (!parsed.success) return RA.ok([]);
    return RA.ok(
      parsed.data.feed.flatMap((entry): BlueskyTopicPost[] => {
        if (entry === null) return [];
        const { post } = entry;
        const url = blueskyPostWebUrl(post.uri, post.author.handle);
        if (url === undefined) return [];
        return [{
          url,
          authorHandle: post.author.handle,
          authorDisplayName: post.author.displayName ?? null,
          text: post.record.text,
          postedAt: post.record.createdAt ?? null,
          likeCount: post.likeCount ?? 0,
          repostCount: post.repostCount ?? 0,
        }];
      }).slice(0, limit),
    );
  },
});
