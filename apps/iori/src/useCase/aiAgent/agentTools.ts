import type { Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { ActorId } from '../../domain/actor/actorId.ts';
import { PostId } from '../../domain/post/postId.ts';
import type { AgentTool } from './agentLoop.ts';

/** モデルに読ませる投稿。本文は HTML を外した文 */
export type AgentPostView = Readonly<{
  postId: PostId;
  /** モデルには見せない。bot 自身の投稿を数えるのに使う */
  authorActorId: ActorId;
  author: string;
  text: string;
  createdAt: string;
  url?: string;
}>;

export type AgentFetchedPage = Readonly<{ finalUrl: string; text: string }>;

/**
 * bot が外の世界に対してできること。runtime が既存のユースケースを組み合わせて用意する。
 * 読み取りは bot から見える投稿に限る（非公開の投稿やほかの人の DM は返さない）。
 */
export type AiAgentBotCapabilities = Readonly<{
  readPost: (postId: PostId) => Promise<AgentPostView | undefined>;
  readThread: (postId: PostId) => Promise<readonly AgentPostView[]>;
  searchTimeline: (query: string) => Promise<readonly AgentPostView[]>;
  readRecentTimeline: (limit: number) => Promise<readonly AgentPostView[]>;
  fetchUrl: (url: string) => Promise<Result<AgentFetchedPage, string>>;
  likePost: (postId: PostId) => Promise<Result<void, string>>;
  repostPost: (postId: PostId) => Promise<Result<void, string>>;
  followAuthor: (postId: PostId) => Promise<Result<void, string>>;
}>;

/** 1 回の実行で、いいね・リポスト・フォローを合わせて行える回数の上限 */
export const MAX_ACTIONS_PER_RUN = 3;

export const MAX_SEARCH_RESULTS = 10;
export const MAX_RECENT_TIMELINE = 20;
export const MAX_FETCHED_PAGE_CHARS = 5000;

export const formatPost = (post: AgentPostView): string =>
  [
    `[postId: ${post.postId}] ${post.author} (${post.createdAt})${post.url === undefined ? '' : ` ${post.url}`}`,
    post.text,
  ].join('\n');

export const formatPosts = (posts: readonly AgentPostView[]): string =>
  posts.length === 0 ? '該当する投稿はありません。' : posts.map(formatPost).join('\n\n');

const postIdArgs = z.object({ postId: z.string() });
const queryArgs = z.object({ query: z.string().min(1).max(200) });
const urlArgs = z.object({ url: z.string().min(1).max(2000) });
const limitArgs = z.object({ limit: z.coerce.number().int().min(1).max(MAX_RECENT_TIMELINE).optional() });

const invalidArgs = (name: string): string => `エラー: ${name} の引数が正しくありません。`;

const withPostId = (name: string, run: (postId: PostId) => Promise<string>) => async (args: unknown) => {
  const parsed = postIdArgs.safeParse(args);
  if (!parsed.success) return invalidArgs(name);
  const postId = PostId.parse(parsed.data.postId.trim());
  if (!postId.ok) return `エラー: ${parsed.data.postId} は postId の形式ではありません。`;
  return run(postId.val);
};

const postIdParameter = {
  type: 'object',
  properties: { postId: { type: 'string', description: '投稿の postId（UUID）' } },
  required: ['postId'],
} as const;

const readingTools = (capabilities: AiAgentBotCapabilities): AgentTool[] => [
  {
    name: 'get_post',
    description: 'postId を指定して、1 件の投稿の本文と投稿者を読む。',
    parameters: postIdParameter,
    run: withPostId('get_post', async (postId) => {
      const post = await capabilities.readPost(postId);
      return post === undefined ? 'その投稿は見つからないか、bot からは見えません。' : formatPost(post);
    }),
  },
  {
    name: 'get_thread',
    description: 'postId を指定して、その投稿を含むスレッド（返信のつながり）を古い順に読む。',
    parameters: postIdParameter,
    run: withPostId('get_thread', async (postId) => formatPosts(await capabilities.readThread(postId))),
  },
  {
    name: 'search_timeline',
    description: 'キーワードで、bot がフォローしている人の投稿を全文検索する。',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: '空白区切りのキーワード' } },
      required: ['query'],
    },
    run: async (args) => {
      const parsed = queryArgs.safeParse(args);
      if (!parsed.success) return invalidArgs('search_timeline');
      const posts = await capabilities.searchTimeline(parsed.data.query);
      return formatPosts(posts.slice(0, MAX_SEARCH_RESULTS));
    },
  },
  {
    name: 'get_recent_timeline',
    description: 'bot のホームタイムライン（フォローしている人と bot 自身の投稿）の最近の投稿を新しい順に読む。',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number', description: `読む件数（1〜${MAX_RECENT_TIMELINE}）` } },
      required: [],
    },
    run: async (args) => {
      const parsed = limitArgs.safeParse(args ?? {});
      if (!parsed.success) return invalidArgs('get_recent_timeline');
      return formatPosts(await capabilities.readRecentTimeline(parsed.data.limit ?? 10));
    },
  },
  {
    name: 'fetch_url',
    description:
      'http(s) の URL のページを取得し、本文を Markdown で読む。投稿に貼られたリンクの中身を確かめるときに使う。',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string', description: '読む URL' } },
      required: ['url'],
    },
    run: async (args) => {
      const parsed = urlArgs.safeParse(args);
      if (!parsed.success) return invalidArgs('fetch_url');
      const page = await capabilities.fetchUrl(parsed.data.url.trim());
      if (!page.ok) return `エラー: ページを取得できませんでした（${page.err}）。`;
      const text = page.val.text.length > MAX_FETCHED_PAGE_CHARS
        ? `${page.val.text.slice(0, MAX_FETCHED_PAGE_CHARS)}\n…(省略)`
        : page.val.text;
      return `URL: ${page.val.finalUrl}\n\n${text}`;
    },
  },
];

const actionTools = (capabilities: AiAgentBotCapabilities): AgentTool[] => {
  let remaining = MAX_ACTIONS_PER_RUN;
  const action = (
    name: string,
    description: string,
    run: (postId: PostId) => Promise<Result<void, string>>,
    done: string,
  ): AgentTool => ({
    name,
    description,
    parameters: postIdParameter,
    run: withPostId(name, async (postId) => {
      if (remaining <= 0) return 'エラー: この実行でできる操作の上限に達しました。';
      remaining--;
      const result = await run(postId);
      return result.ok ? done : `エラー: ${result.err}`;
    }),
  });
  return [
    action(
      'like_post',
      'postId の投稿にいいねする。共感した投稿や、感謝を伝えたいときに使う。',
      capabilities.likePost,
      'いいねしました。',
    ),
    action(
      'repost_post',
      'postId の投稿をリポスト（ブースト）する。多くの人に読んでほしい投稿にだけ使う。',
      capabilities.repostPost,
      'リポストしました。',
    ),
    action(
      'follow_author',
      'postId の投稿の投稿者をフォローする。今後もその人の投稿を読みたいときに使う。',
      capabilities.followAuthor,
      'フォローしました。',
    ),
  ];
};

/** bot に渡す道具の一覧。読み取りの道具と、いいね・リポスト・フォローの道具 */
export const createAgentTools = (capabilities: AiAgentBotCapabilities): AgentTool[] => [
  ...readingTools(capabilities),
  ...actionTools(capabilities),
];
