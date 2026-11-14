import type { RA } from '@iwasa-kosui/result';

import type { Agg } from '../aggregate/index.ts';
import type { BlueskyTimelineItem } from '../blueskyTimeline/blueskyTimelineItem.ts';
import type { Instant } from '../instant/instant.ts';

/** 最近よく読まれている記事。はてなブックマークの数を人気の目安にする */
export type PopularArticle = Readonly<{
  title: string;
  url: string;
  bookmarkCount: number;
  sourceTitle: string;
}>;

export type PopularArticlesResolverByFetchedSince = Agg.Resolver<
  Readonly<{ fetchedSince: Instant; limit: number }>,
  readonly PopularArticle[]
>;

/** 人気の記事として紹介するのは、この期間に集めた記事 */
export const POPULAR_ARTICLE_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

/** Bluesky で話題かどうかを調べる候補の投稿。タイムラインに流れてきた投稿から作る */
export type BlueskyTrendCandidate = Readonly<{
  uri: string;
  authorHandle: string;
  authorDisplayName: string | null;
  text: string;
  linkUrl: string | null;
  postedAt: Instant;
  /** タイムラインの中で、この投稿をリポストした人の数 */
  timelineReposts: number;
}>;

/** Bluesky の投稿の反応の数 */
export type BlueskyPostStats = Readonly<{
  uri: string;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  quoteCount: number;
}>;

/** 投稿の URI から、いまの反応の数を読む。読めなかった投稿は結果に含めない */
export type BlueskyPostStatsResolver = Readonly<{
  resolve: (uris: readonly string[]) => RA<ReadonlyMap<string, BlueskyPostStats>, never>;
}>;

export type BlueskyTrendingPost = BlueskyTrendCandidate & BlueskyPostStats & Readonly<{ url: string; score: number }>;

/** これより古い投稿は、いまの話題とはみなさない */
export const BLUESKY_TREND_WINDOW_MS = 48 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;

/** at://did/app.bsky.feed.post/rkey を、ブラウザで開ける bsky.app の URL にする */
export const blueskyPostWebUrl = (uri: string, handle: string): string | undefined => {
  const matched = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/.exec(uri);
  if (matched === null) return undefined;
  return `https://bsky.app/profile/${encodeURIComponent(handle)}/post/${encodeURIComponent(matched[2]!)}`;
};

const linkUrlOf = (item: BlueskyTimelineItem): string | null => {
  const embed = item.embed;
  if (embed?.type === 'external') return embed.uri;
  return null;
};

/**
 * タイムラインの投稿から、話題かどうかを調べる候補を作る。
 * - 同じ投稿は 1 件にまとめ、タイムラインでリポストした人の数を数える
 * - 返信は会話の途中なので、紹介する候補にしない
 * - 古い投稿は候補にしない
 */
const collectCandidates = (
  items: readonly BlueskyTimelineItem[],
  now: Instant,
): BlueskyTrendCandidate[] => {
  const byUri = new Map<string, BlueskyTrendCandidate & { reposters: Set<string> }>();
  for (const item of items) {
    if (item.replyParentUri !== null) continue;
    if (now - item.postedAt > BLUESKY_TREND_WINDOW_MS) continue;
    const existing = byUri.get(item.uri) ?? {
      uri: item.uri,
      authorHandle: item.authorHandle,
      authorDisplayName: item.authorDisplayName,
      text: item.text,
      linkUrl: linkUrlOf(item),
      postedAt: item.postedAt,
      timelineReposts: 0,
      reposters: new Set<string>(),
    };
    if (item.repostedByDid !== null) existing.reposters.add(item.repostedByDid);
    byUri.set(item.uri, existing);
  }
  return [...byUri.values()].map(({ reposters, ...candidate }) => ({
    ...candidate,
    timelineReposts: reposters.size,
  }));
};

/**
 * 候補の投稿を、話題になっている順に並べる。
 * 反応の数（リポストと引用は広がりを示すので重く数える）と、タイムラインでリポストした人の数を足し、
 * 時間がたつほど割り引く（新しくて伸びている投稿を上にする）。反応の数を読めなかった投稿は除く。
 */
const rank = (
  input: Readonly<{
    candidates: readonly BlueskyTrendCandidate[];
    stats: ReadonlyMap<string, BlueskyPostStats>;
    now: Instant;
    limit: number;
  }>,
): BlueskyTrendingPost[] =>
  input.candidates
    .flatMap((candidate): BlueskyTrendingPost[] => {
      const stats = input.stats.get(candidate.uri);
      const url = blueskyPostWebUrl(candidate.uri, candidate.authorHandle);
      if (stats === undefined || url === undefined) return [];
      const engagement = stats.likeCount + 2 * stats.repostCount + 2 * stats.quoteCount + stats.replyCount
        + 5 * candidate.timelineReposts;
      if (engagement === 0) return [];
      const ageHours = Math.max(0, input.now - candidate.postedAt) / HOUR_MS;
      const score = engagement / (ageHours + 2) ** 1.2;
      return [{ ...candidate, ...stats, url, score }];
    })
    .sort((a, b) => b.score - a.score || a.uri.localeCompare(b.uri))
    .slice(0, input.limit);

export const BlueskyTrend = {
  collectCandidates,
  rank,
} as const;
