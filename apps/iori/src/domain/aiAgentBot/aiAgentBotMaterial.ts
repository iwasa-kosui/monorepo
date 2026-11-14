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

/** Bluesky 全体でいま話題になっていること。Bluesky の公開 AppView の getTrends から読む */
export type BlueskyTrend = Readonly<{
  /** 話題の ID。話題の投稿を読むときに使う */
  topic: string;
  displayName: string;
  description: string | null;
  postCount: number | null;
  status: string | null;
  category: string | null;
  /** 話題の投稿を集めたフィード（at://did/app.bsky.feed.generator/rkey） */
  feedUri: string | null;
}>;

/** Bluesky の投稿。話題の中身を確かめるために読む */
export type BlueskyTopicPost = Readonly<{
  url: string;
  authorHandle: string;
  authorDisplayName: string | null;
  text: string;
  postedAt: string | null;
  likeCount: number;
  repostCount: number;
}>;

export type BlueskyTrendsResolver = Readonly<{
  resolve: (limit: number) => RA<readonly BlueskyTrend[], never>;
}>;

export type BlueskyTrendPostsResolver = Readonly<{
  resolve: (condition: Readonly<{ feedUri: string; limit: number }>) => RA<readonly BlueskyTopicPost[], never>;
}>;

/** getTrends の link（/profile/did/feed/rkey）を、getFeed に渡すフィードの URI にする */
export const blueskyTrendFeedUri = (link: string): string | null => {
  const matched = /^\/profile\/(did:[a-z0-9]+:[A-Za-z0-9._:%-]+)\/feed\/([A-Za-z0-9._~-]+)$/.exec(link);
  return matched === null ? null : `at://${matched[1]}/app.bsky.feed.generator/${matched[2]}`;
};

/** 話題とみなすのは、これより新しい投稿 */
export const BLUESKY_TOPIC_WINDOW_MS = 48 * 60 * 60 * 1000;

/** タイムラインでこの人数以上が触れていれば、話題とみなす */
export const MIN_PEOPLE_FOR_TIMELINE_TOPIC = 2;

const MAX_SAMPLE_POSTS_PER_TOPIC = 3;

/** タイムラインで複数の人が触れている話題。同じリンクか、同じハッシュタグでまとめる */
export type BlueskyTimelineTopic = Readonly<{
  kind: 'link' | 'hashtag';
  /** リンクなら URL、ハッシュタグなら #タグ */
  label: string;
  /** リンクの記事の題名（分かれば） */
  title: string | null;
  /** 投稿やリポストで触れた人の数 */
  people: number;
  posts: readonly BlueskyTopicPost[];
}>;

/** at://did/app.bsky.feed.post/rkey を、ブラウザで開ける bsky.app の URL にする */
export const blueskyPostWebUrl = (uri: string, handle: string): string | undefined => {
  const matched = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/.exec(uri);
  if (matched === null) return undefined;
  return `https://bsky.app/profile/${encodeURIComponent(handle)}/post/${encodeURIComponent(matched[2]!)}`;
};

/** 同じ記事へのリンクを 1 つにまとめるため、計測用のパラメータ・フラグメント・末尾のスラッシュを除く */
const normalizeLink = (raw: string): string | undefined => {
  if (!URL.canParse(raw)) return undefined;
  const url = new URL(raw);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_|fbclid$|gclid$|ref$|ref_src$)/i.test(key)) url.searchParams.delete(key);
  }
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString();
};

const normalizeTag = (tag: string): string => tag.normalize('NFKC').toLowerCase().replace(/^#/, '');

type TopicKey = Readonly<{ kind: 'link' | 'hashtag'; key: string; title: string | null }>;

/** 1 件の投稿が触れている話題（リンクとハッシュタグ）。Bluesky の投稿へのリンクは引用なので数えない */
const topicKeysOf = (item: BlueskyTimelineItem): TopicKey[] => {
  const keys = new Map<string, TopicKey>();
  const addLink = (raw: string, title: string | null) => {
    const link = normalizeLink(raw);
    if (link === undefined || new URL(link).hostname === 'bsky.app') return;
    const existing = keys.get(`link:${link}`);
    keys.set(`link:${link}`, { kind: 'link', key: link, title: existing?.title ?? title });
  };
  if (item.embed?.type === 'external') addLink(item.embed.uri, item.embed.title || null);
  if (item.embed?.type === 'recordWithMedia' && item.embed.media.type === 'external') {
    addLink(item.embed.media.uri, item.embed.media.title || null);
  }
  for (const facet of item.facets) {
    if (facet.feature.type === 'link') addLink(facet.feature.uri, null);
    if (facet.feature.type === 'tag') {
      const tag = normalizeTag(facet.feature.tag);
      if (tag.length > 0) keys.set(`hashtag:${tag}`, { kind: 'hashtag', key: `#${tag}`, title: null });
    }
  }
  return [...keys.values()];
};

const toTopicPost = (item: BlueskyTimelineItem): BlueskyTopicPost | undefined => {
  const url = blueskyPostWebUrl(item.uri, item.authorHandle);
  if (url === undefined) return undefined;
  return {
    url,
    authorHandle: item.authorHandle,
    authorDisplayName: item.authorDisplayName,
    text: item.text,
    postedAt: new Date(item.postedAt).toISOString(),
    likeCount: 0,
    repostCount: 0,
  };
};

/**
 * タイムラインの投稿から、複数の人が触れている話題を見つける。
 * - 同じリンク（計測用のパラメータを除いて同じ URL）か、同じハッシュタグに触れた投稿をまとめる
 * - 投稿した人とリポストした人を、重複なく数える。一人で何度も投稿しても話題にはならない
 * - 古い投稿は数えない
 * 触れた人の多い順に返す。
 */
const collectTimelineTopics = (
  items: readonly BlueskyTimelineItem[],
  now: Instant,
  limit: number,
): BlueskyTimelineTopic[] => {
  const topics = new Map<
    string,
    { topic: TopicKey; title: string | null; people: Set<string>; posts: Map<string, BlueskyTopicPost> }
  >();
  for (const item of items) {
    if (now - item.postedAt > BLUESKY_TOPIC_WINDOW_MS) continue;
    for (const topic of topicKeysOf(item)) {
      const id = `${topic.kind}:${topic.key}`;
      const entry = topics.get(id) ?? { topic, title: null, people: new Set(), posts: new Map() };
      entry.title ??= topic.title;
      entry.people.add(item.authorDid);
      if (item.repostedByDid !== null) entry.people.add(item.repostedByDid);
      const post = toTopicPost(item);
      if (post !== undefined && entry.posts.size < MAX_SAMPLE_POSTS_PER_TOPIC) entry.posts.set(item.uri, post);
      topics.set(id, entry);
    }
  }
  return [...topics.values()]
    .filter((entry) => entry.people.size >= MIN_PEOPLE_FOR_TIMELINE_TOPIC)
    .sort((a, b) => b.people.size - a.people.size || a.topic.key.localeCompare(b.topic.key))
    .slice(0, limit)
    .map((entry) => ({
      kind: entry.topic.kind,
      label: entry.topic.key,
      title: entry.title,
      people: entry.people.size,
      posts: [...entry.posts.values()],
    }));
};

/** 話題を探すためにモデルに見せる、タイムラインの最近の投稿。返信と古い投稿を除き、同じ投稿は 1 件にする */
const recentTimelinePosts = (
  items: readonly BlueskyTimelineItem[],
  now: Instant,
  limit: number,
): BlueskyTopicPost[] => {
  const seen = new Set<string>();
  const posts: BlueskyTopicPost[] = [];
  for (const item of items) {
    if (posts.length >= limit) break;
    if (item.replyParentUri !== null || now - item.postedAt > BLUESKY_TOPIC_WINDOW_MS || seen.has(item.uri)) continue;
    seen.add(item.uri);
    const post = toTopicPost(item);
    if (post !== undefined && post.text.trim().length > 0) posts.push(post);
  }
  return posts;
};

export const BlueskyTopics = {
  collectTimelineTopics,
  recentTimelinePosts,
} as const;
