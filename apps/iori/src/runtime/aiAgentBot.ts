import type { RequestContext } from '@fedify/fedify';
import { Result } from '@iwasa-kosui/result';

import { createD1LocalActorCreatedStore } from '../adaptor/d1/actor/localActorCreatedStore.ts';
import { createD1LocalActorProfileUpdatedStore } from '../adaptor/d1/actor/localActorProfileUpdatedStore.ts';
import { createD1AiAgentBotPendingTriggersResolver } from '../adaptor/d1/aiAgentBot/aiAgentBotPendingTriggersResolver.ts';
import { createD1AiAgentBotRepliedCountResolverSince } from '../adaptor/d1/aiAgentBot/aiAgentBotRepliedCountResolverSince.ts';
import { createD1AiAgentBotTriggersHandledStore } from '../adaptor/d1/aiAgentBot/aiAgentBotTriggersHandledStore.ts';
import { createD1UserCreatedStore } from '../adaptor/d1/user/userCreatedStore.ts';
import { createD1UserResolverByUsername } from '../adaptor/d1/user/userResolverByUsername.ts';
import { createSafeFetcher, type SafeFetcher } from '../adaptor/http/safeFetch.ts';
import { htmlToMarkdown } from '../adaptor/text/htmlToMarkdown.ts';
import { htmlToPlainText } from '../adaptor/text/htmlToPlainText.ts';
import { createWorkersAiAgentChatModel } from '../adaptor/workersAi/workersAiAgentChatModel.ts';
import type { WorkersAiRunner } from '../adaptor/workersAi/workersAiRunner.ts';
import type { ActorId } from '../domain/actor/actorId.ts';
import type { LocalActor } from '../domain/actor/localActor.ts';
import { Instant } from '../domain/instant/instant.ts';
import { plainTextToHtml } from '../domain/post/plainTextToHtml.ts';
import type { PostWithAuthor } from '../domain/post/post.ts';
import type { PostId } from '../domain/post/postId.ts';
import { TimelineSearchQuery } from '../domain/timelineSearch/timelineSearchQuery.ts';
import type { User } from '../domain/user/user.ts';
import type { AgentPostView, AiAgentBotCapabilities } from '../useCase/aiAgent/agentTools.ts';
import { EnsureAiAgentBotUseCase } from '../useCase/ensureAiAgentBot.ts';
import { type AiAgentBotPoster, PostAiAgentMusingUseCase } from '../useCase/postAiAgentMusing.ts';
import { type AiAgentBotReplier, RespondToAiAgentMentionsUseCase } from '../useCase/respondToAiAgentMentions.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import type { WorkerRuntimePorts } from './ports.ts';

export const AI_AGENT_BOT_ENABLED_VALUE = 'enabled';

const POST_TEXT_MAX_CHARS = 1000;
const FETCH_OPTIONS = {
  timeoutMs: 10_000,
  maxBytes: 2 * 1024 * 1024,
  maxRedirects: 3,
  acceptContentType: (contentType: string | undefined) =>
    contentType === undefined || /^(?:text\/|application\/(?:xhtml\+xml|xml|json))/i.test(contentType),
} as const;

/** IORI_AI_AGENT_BOT が enabled で、Workers AI が使えるときだけ bot を動かす */
export const resolveAiAgentBotRunner = (
  env: Pick<IoriWorkerEnv, 'IORI_AI_AGENT_BOT' | 'AI'>,
): WorkersAiRunner | undefined =>
  env.IORI_AI_AGENT_BOT === AI_AGENT_BOT_ENABLED_VALUE && env.AI !== undefined
    ? env.AI as unknown as WorkersAiRunner
    : undefined;

const authorHandle = (post: PostWithAuthor): string => {
  if (post.type === 'remote' && URL.canParse(post.uri)) return `@${post.username}@${new URL(post.uri).host}`;
  return `@${post.username}`;
};

export const toAgentPostView = (post: PostWithAuthor): AgentPostView => {
  const text = htmlToPlainText(post.content, POST_TEXT_MAX_CHARS);
  return {
    postId: post.postId,
    authorActorId: post.actorId,
    author: authorHandle(post),
    text: post.summary === null || post.summary.length === 0 ? text : `（注意書き: ${post.summary}）\n${text}`,
    createdAt: new Date(post.createdAt).toISOString(),
    ...(post.type === 'remote' ? { url: post.url ?? post.uri } : {}),
  };
};

const fetchPage = (safeFetcher: SafeFetcher) => async (url: string) => {
  if (!/^https?:\/\//i.test(url)) return Result.err('http か https の URL だけを取得できます');
  const fetched = await safeFetcher.fetchText(url, FETCH_OPTIONS);
  if (!fetched.ok) return Result.err(fetched.err.message);
  if (fetched.val.status < 200 || fetched.val.status >= 300 || fetched.val.body === undefined) {
    return Result.err(`HTTP ${fetched.val.status}`);
  }
  const body = fetched.val.body;
  const isHtml = fetched.val.contentType === undefined || /html/i.test(fetched.val.contentType);
  return Result.ok({ finalUrl: fetched.val.finalUrl, text: isHtml ? htmlToMarkdown(body) : body });
};

type Bot = Readonly<{ user: User; actor: LocalActor }>;

/** bot から見える範囲で読み、bot として行動する道具の中身を用意する */
export const createAiAgentBotCapabilities = (
  runtime: WorkerRuntimePorts,
  bot: Bot,
  context: Readonly<{ request: Request; ctx: RequestContext<unknown> }>,
  safeFetcher: SafeFetcher = createSafeFetcher(),
): AiAgentBotCapabilities => {
  const { mastodon, socialActions, core } = runtime;
  const viewer = { currentActorId: bot.actor.id, onlyVisibleToViewer: true } as const;
  const { ctx } = context;

  const resolvePosts = async (postIds: readonly PostId[]): Promise<AgentPostView[]> => {
    if (postIds.length === 0) return [];
    const resolved = await mastodon.postsWithAuthorResolverByPostIds.resolve({ postIds, ...viewer });
    if (!resolved.ok) return [];
    return postIds.flatMap((postId) => {
      const post = resolved.val.get(postId);
      return post === undefined ? [] : [toAgentPostView(post)];
    });
  };

  const message = (error: unknown): string =>
    typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : String(error);

  const homeActorIds = async (): Promise<ActorId[]> => {
    const following = await mastodon.actorsResolverByFollowerId.resolve(bot.actor.id);
    return [bot.actor.id, ...(following.ok ? following.val.map((actor) => actor.id) : [])];
  };

  return {
    readPost: async (postId) => (await resolvePosts([postId]))[0],
    readThread: async (postId) => {
      const thread = await mastodon.threadResolver.resolve({ postId, ...viewer });
      if (!thread.ok || thread.val.currentPost === null) return [];
      return [...thread.val.ancestors, thread.val.currentPost, ...thread.val.descendants].map(toAgentPostView);
    },
    searchTimeline: async (text) => {
      const query = TimelineSearchQuery.parse({ text });
      if (!query.ok) return [];
      const found = await mastodon.searchTimeline.run({ userId: bot.user.id, query: query.val });
      return found.ok ? resolvePosts(found.val.postIds) : [];
    },
    readRecentTimeline: async (limit) => {
      const items = await mastodon.timelineItemsResolverByActorIds.resolve({
        actorIds: await homeActorIds(),
        currentActorId: bot.actor.id,
        createdAt: undefined,
        mutedActorIds: [],
        page: { limit, olderThanId: undefined, newerThanId: undefined, order: 'newestFirst' },
        onlyVisibleToViewer: true,
      });
      return items.ok ? items.val.slice(0, limit).map((item) => toAgentPostView(item.post)) : [];
    },
    fetchUrl: fetchPage(safeFetcher),
    likePost: async (postId) => {
      const liked = await socialActions.sendLikeUseCase.run({ userId: bot.user.id, postId, ...context });
      return liked.ok ? Result.ok(undefined) : Result.err(message(liked.err));
    },
    repostPost: async (postId) => {
      const reposted = await socialActions.sendRepostUseCase.run({ userId: bot.user.id, postId, ...context });
      return reposted.ok ? Result.ok(undefined) : Result.err(message(reposted.err));
    },
    followAuthor: async (postId) => {
      const [post] = await resolvePosts([postId]);
      if (post === undefined) return Result.err('投稿が見つかりません');
      if (post.authorActorId === bot.actor.id) return Result.err('自分はフォローできません');
      const followed = await core.followActor({ userId: bot.user.id, actorId: post.authorActorId, ctx });
      return followed.ok ? Result.ok(undefined) : Result.err(followed.err.message);
    },
  };
};

export const createAiAgentBotReplier = (
  runtime: WorkerRuntimePorts,
  bot: Bot,
  context: Readonly<{ request: Request; ctx: RequestContext<unknown> }>,
): AiAgentBotReplier => ({
  reply: async ({ postId, content, mentions }) => {
    const sent = await runtime.core.sendReplyUseCase.run({
      userId: bot.user.id,
      postId,
      content,
      mentions,
      summary: null,
      sensitive: false,
      images: [],
      crosspostToBluesky: false,
      request: context.request,
      ctx: context.ctx,
    });
    return sent.ok ? Result.ok(undefined) : Result.err(sent.err.message);
  },
});

export const createAiAgentBotPoster = (
  runtime: WorkerRuntimePorts,
  bot: Bot,
  context: Readonly<{ ctx: RequestContext<unknown> }>,
): AiAgentBotPoster => ({
  post: async (text) => {
    const created = await runtime.posting.createPostUseCase.run({
      userId: bot.user.id,
      content: plainTextToHtml(text),
      visibility: 'public',
      summary: null,
      sensitive: false,
      images: [],
      crosspostToBluesky: false,
      ctx: context.ctx,
    });
    return created.ok ? Result.ok(created.val.post.postId) : Result.err(created.err.message);
  },
});

/** bot の cron が使うものをまとめて用意する。bot が無効なら undefined を返す */
export const createAiAgentBotRuntime = async (
  env: IoriWorkerEnv,
  createRuntime: () => Promise<WorkerRuntimePorts>,
) => {
  const runner = resolveAiAgentBotRunner(env);
  if (runner === undefined) return undefined;
  const runtime = await createRuntime();
  const db = runtime.db;
  const chatModel = createWorkersAiAgentChatModel(runner);
  const request = new Request(new URL('/', env.ORIGIN));
  const ctx = runtime.federation.createContext(request, undefined);
  const ensured = await EnsureAiAgentBotUseCase.create({
    userResolverByUsername: createD1UserResolverByUsername(db),
    userCreatedStore: createD1UserCreatedStore(db),
    localActorCreatedStore: createD1LocalActorCreatedStore(db),
    actorResolverByUserId: runtime.mastodon.actorResolverByUserId,
    localActorProfileUpdatedStore: createD1LocalActorProfileUpdatedStore(db),
    now: Instant.now,
  }).run({ ctx });
  const bot = ensured.val;
  const context = { request, ctx };
  return {
    bot,
    capabilities: createAiAgentBotCapabilities(runtime, bot, context),
    replier: createAiAgentBotReplier(runtime, bot, context),
    poster: createAiAgentBotPoster(runtime, bot, context),
    respondToMentions: RespondToAiAgentMentionsUseCase.create({
      pendingTriggersResolver: createD1AiAgentBotPendingTriggersResolver(db),
      triggersHandledStore: createD1AiAgentBotTriggersHandledStore(db),
      repliedCountResolverSince: createD1AiAgentBotRepliedCountResolverSince(db),
      actorResolverById: runtime.mastodon.actorResolverById,
      chatModel,
      now: Instant.now,
    }),
    postMusing: PostAiAgentMusingUseCase.create({ chatModel, now: Instant.now }),
  } as const;
};

export type AiAgentBotRuntime = NonNullable<Awaited<ReturnType<typeof createAiAgentBotRuntime>>>;
