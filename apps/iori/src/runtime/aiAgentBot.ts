import type { RequestContext } from '@fedify/fedify';
import { Delete, PUBLIC_COLLECTION } from '@fedify/vocab';
import { Result } from '@iwasa-kosui/result';

import { createD1LocalActorCreatedStore } from '../adaptor/d1/actor/localActorCreatedStore.ts';
import { createD1LocalActorProfileUpdatedStore } from '../adaptor/d1/actor/localActorProfileUpdatedStore.ts';
import { createD1LogoUriUpdatedStore } from '../adaptor/d1/actor/logoUriUpdatedStore.ts';
import {
  createD1AiAgentBotDueFollowupsResolver,
  createD1AiAgentBotPendingFollowupsCountResolver,
} from '../adaptor/d1/aiAgentBot/aiAgentBotDueFollowupsResolver.ts';
import {
  createD1AiAgentBotFollowBackAttemptedStore,
  createD1AiAgentBotFollowBackCandidatesResolver,
} from '../adaptor/d1/aiAgentBot/aiAgentBotFollowBackAdapters.ts';
import { createD1AiAgentBotFollowupClaimedStore } from '../adaptor/d1/aiAgentBot/aiAgentBotFollowupClaimedStore.ts';
import { createD1AiAgentBotFollowupScheduledStore } from '../adaptor/d1/aiAgentBot/aiAgentBotFollowupScheduledStore.ts';
import { createD1AiAgentBotFollowupsHandledStore } from '../adaptor/d1/aiAgentBot/aiAgentBotFollowupsHandledStore.ts';
import {
  createD1AiAgentBotMemoriesResolverBySubject,
  createD1AiAgentBotMemoryChangedStore,
} from '../adaptor/d1/aiAgentBot/aiAgentBotMemoryAdapters.ts';
import { createD1AiAgentBotPendingTriggersResolver } from '../adaptor/d1/aiAgentBot/aiAgentBotPendingTriggersResolver.ts';
import { createD1AiAgentBotRepliedCountResolverSince } from '../adaptor/d1/aiAgentBot/aiAgentBotRepliedCountResolverSince.ts';
import { createD1AiAgentBotTriggerClaimedStore } from '../adaptor/d1/aiAgentBot/aiAgentBotTriggerClaimedStore.ts';
import { createD1AiAgentBotTriggersHandledStore } from '../adaptor/d1/aiAgentBot/aiAgentBotTriggersHandledStore.ts';
import { createD1PopularArticlesResolverByFetchedSince } from '../adaptor/d1/feedEntry/popularArticlesResolverByFetchedSince.ts';
import { createD1LocalAccountRetiredStore } from '../adaptor/d1/user/localAccountRetiredStore.ts';
import { createD1UserCreatedStore } from '../adaptor/d1/user/userCreatedStore.ts';
import { createD1UserResolverByUsername } from '../adaptor/d1/user/userResolverByUsername.ts';
import { createSafeFetcher, type SafeFetcher } from '../adaptor/http/safeFetch.ts';
import { htmlToMarkdown } from '../adaptor/text/htmlToMarkdown.ts';
import { htmlToPlainText } from '../adaptor/text/htmlToPlainText.ts';
import { createWorkersAiAgentChatModel } from '../adaptor/workersAi/workersAiAgentChatModel.ts';
import type { WorkersAiRunner } from '../adaptor/workersAi/workersAiRunner.ts';
import type { ActorId } from '../domain/actor/actorId.ts';
import type { LocalActor } from '../domain/actor/localActor.ts';
import { AiAgentBot } from '../domain/aiAgentBot/aiAgentBot.ts';
import {
  POPULAR_ARTICLE_WINDOW_MS,
  type PopularArticlesResolverByFetchedSince,
} from '../domain/aiAgentBot/aiAgentBotMaterial.ts';
import { Instant } from '../domain/instant/instant.ts';
import { plainTextToHtml } from '../domain/post/plainTextToHtml.ts';
import type { PostWithAuthor } from '../domain/post/post.ts';
import type { PostId } from '../domain/post/postId.ts';
import { TimelineSearchQuery } from '../domain/timelineSearch/timelineSearchQuery.ts';
import type { User } from '../domain/user/user.ts';
import { createDigestSendingUseCases } from '../scheduled/digestTasks.ts';
import { type AgentPostView, type AiAgentBotCapabilities } from '../useCase/aiAgent/agentTools.ts';
import type { SendDigestTo } from '../useCase/aiAgent/digestTool.ts';
import { EnsureAiAgentBotUseCase } from '../useCase/ensureAiAgentBot.ts';
import { type AiAgentBotFollower, FollowBackAiAgentFollowersUseCase } from '../useCase/followBackAiAgentFollowers.ts';
import { IsDigestOwner } from '../useCase/isDigestOwner.ts';
import { type AiAgentBotPoster, PostAiAgentMusingUseCase } from '../useCase/postAiAgentMusing.ts';
import { type AiAgentBotReplier, RespondToAiAgentMentionsUseCase } from '../useCase/respondToAiAgentMentions.ts';
import { type LocalActorDeletionAnnouncer, RetireLocalAccountsUseCase } from '../useCase/retireLocalAccounts.ts';
import { RunAiAgentFollowupsUseCase } from '../useCase/runAiAgentFollowups.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import { createDigestDmSender, createDigestPostDeleter } from './digestDm.ts';
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
    ...(post.visibility === null ? {} : { visibility: post.visibility }),
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

/** bot が話題の材料を読むところ。いまは人気の記事だけ */
export type AiAgentBotMaterialSources = Readonly<{
  popularArticlesResolver: PopularArticlesResolverByFetchedSince;
}>;

const readPopularArticles = (sources: AiAgentBotMaterialSources) => async (limit: number) => {
  const fetchedSince = Instant.addDuration(Instant.now(), -POPULAR_ARTICLE_WINDOW_MS);
  return (await sources.popularArticlesResolver.resolve({ fetchedSince, limit })).val;
};

/** bot から見える範囲で読み、bot として行動するツールの中身を用意する */
export const createAiAgentBotCapabilities = (
  runtime: WorkerRuntimePorts,
  bot: Bot,
  context: Readonly<{ request: Request; ctx: RequestContext<unknown> }>,
  materials: AiAgentBotMaterialSources,
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

  const readTimeline = async (actorIds: readonly ActorId[], limit: number): Promise<AgentPostView[]> => {
    const items = await mastodon.timelineItemsResolverByActorIds.resolve({
      actorIds: [...actorIds],
      currentActorId: bot.actor.id,
      createdAt: undefined,
      mutedActorIds: [],
      page: { limit, olderThanId: undefined, newerThanId: undefined, order: 'newestFirst' },
      onlyVisibleToViewer: true,
    });
    return items.ok ? items.val.slice(0, limit).map((item) => toAgentPostView(item.post)) : [];
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
    readRecentTimeline: async (limit) => readTimeline(await homeActorIds(), limit),
    readOwnRecentPosts: async (limit) =>
      (await readTimeline([bot.actor.id], limit)).filter((post) => post.authorActorId === bot.actor.id),
    fetchUrl: fetchPage(safeFetcher),
    readPopularArticles: readPopularArticles(materials),
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
      visibility: AiAgentBot.postVisibility,
      summary: null,
      sensitive: false,
      images: [],
      crosspostToBluesky: false,
      request: context.request,
      ctx: context.ctx,
    });
    return sent.ok ? Result.ok(sent.val.post.postId) : Result.err(sent.err.message);
  },
});

export const createAiAgentBotFollower = (
  runtime: WorkerRuntimePorts,
  bot: Bot,
  context: Readonly<{ ctx: RequestContext<unknown> }>,
): AiAgentBotFollower => ({
  follow: async (actorId) => {
    const followed = await runtime.core.followActor({ userId: bot.user.id, actorId, ctx: context.ctx });
    return followed.ok ? Result.ok(undefined) : Result.err(followed.err.message);
  },
});

/**
 * アカウントのアクターの Delete を配送する。フォロワーと、フォローしている相手の両方に送る。
 * Fedify は送る時点で鍵と宛先を確定してキューに積むので、このあとアカウントを消しても届く。
 */
export const createLocalActorDeletionAnnouncer = (
  runtime: WorkerRuntimePorts,
  context: Readonly<{ ctx: RequestContext<unknown> }>,
): LocalActorDeletionAnnouncer => ({
  announce: async ({ username, actor }) => {
    const { ctx } = context;
    try {
      const actorUri = ctx.getActorUri(username);
      const following = await runtime.mastodon.actorsResolverByFollowerId.resolve(actor.id);
      const recipients = (following.ok ? following.val : []).flatMap((target) =>
        target.type === 'remote' ? [{ id: new URL(target.uri), inboxId: new URL(target.inboxUrl) }] : []
      );
      const activity = new Delete({
        id: new URL('#delete', actorUri),
        actor: actorUri,
        object: actorUri,
        to: PUBLIC_COLLECTION,
      });
      await ctx.sendActivity({ identifier: username }, 'followers', activity, { preferSharedInbox: true });
      if (recipients.length > 0) {
        await ctx.sendActivity({ identifier: username }, recipients, activity, { preferSharedInbox: true });
      }
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(error instanceof Error ? error.message : String(error));
    }
  },
});

/** 使わなくなった bot のアカウントを消すユースケースを用意する。bot が無効でも動かす */
export const createRetireAiAgentBotAccounts = async (
  env: IoriWorkerEnv,
  createRuntime: () => Promise<WorkerRuntimePorts>,
) => {
  const runtime = await createRuntime();
  const db = runtime.db;
  const request = new Request(new URL('/', env.ORIGIN));
  const ctx = runtime.federation.createContext(request, undefined);
  const useCase = RetireLocalAccountsUseCase.create({
    userResolverByUsername: createD1UserResolverByUsername(db),
    actorResolverByUserId: runtime.mastodon.actorResolverByUserId,
    localAccountRetiredStore: createD1LocalAccountRetiredStore(db),
    deletionAnnouncer: createLocalActorDeletionAnnouncer(runtime, { ctx }),
    now: Instant.now,
  });
  return () => useCase.run({ usernames: AiAgentBot.retiredUsernames });
};

export const createAiAgentBotPoster = (
  runtime: WorkerRuntimePorts,
  bot: Bot,
  context: Readonly<{ ctx: RequestContext<unknown> }>,
): AiAgentBotPoster => ({
  post: async (text) => {
    const created = await runtime.posting.createPostUseCase.run({
      userId: bot.user.id,
      content: plainTextToHtml(text),
      visibility: AiAgentBot.postVisibility,
      summary: null,
      sensitive: false,
      images: [],
      crosspostToBluesky: false,
      ctx: context.ctx,
    });
    return created.ok ? Result.ok(created.val.post.postId) : Result.err(created.err.message);
  },
});

export const createAiAgentBotDigestSender = (
  env: IoriWorkerEnv,
  runtime: WorkerRuntimePorts,
  bot: Bot,
  context: Readonly<{ request: Request; ctx: RequestContext<unknown> }>,
): SendDigestTo => {
  const { requestDigest } = createDigestSendingUseCases(env, {
    dmSender: createDigestDmSender(runtime, bot, context),
    deletePost: createDigestPostDeleter(runtime, bot, context),
  });
  return async (userId) => {
    const requested = await requestDigest.run({ userId });
    return requested.ok
      ? Result.ok({ topics: requested.val.topics, items: requested.val.items })
      : Result.err(requested.err);
  };
};

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
    logoUriUpdatedStore: createD1LogoUriUpdatedStore(db),
    now: Instant.now,
  }).run({ ctx });
  const bot = ensured.val;
  const context = { request, ctx };
  const materials: AiAgentBotMaterialSources = {
    popularArticlesResolver: createD1PopularArticlesResolverByFetchedSince(db),
  };
  const shared = {
    repliedCountResolverSince: createD1AiAgentBotRepliedCountResolverSince(db),
    followupScheduledStore: createD1AiAgentBotFollowupScheduledStore(db),
    pendingFollowupsCountResolver: createD1AiAgentBotPendingFollowupsCountResolver(db),
    memoriesResolverBySubject: createD1AiAgentBotMemoriesResolverBySubject(db),
    memoryChangedStore: createD1AiAgentBotMemoryChangedStore(db),
    actorResolverById: runtime.mastodon.actorResolverById,
    isDigestOwner: IsDigestOwner.create({ userResolverByUsername: createD1UserResolverByUsername(db) }),
    chatModel,
    now: Instant.now,
  };
  return {
    bot,
    sendDigest: createAiAgentBotDigestSender(env, runtime, bot, context),
    capabilities: createAiAgentBotCapabilities(runtime, bot, context, materials),
    follower: createAiAgentBotFollower(runtime, bot, context),
    followBack: FollowBackAiAgentFollowersUseCase.create({
      candidatesResolver: createD1AiAgentBotFollowBackCandidatesResolver(db),
      attemptedStore: createD1AiAgentBotFollowBackAttemptedStore(db),
      now: Instant.now,
    }),
    replier: createAiAgentBotReplier(runtime, bot, context),
    poster: createAiAgentBotPoster(runtime, bot, context),
    respondToMentions: RespondToAiAgentMentionsUseCase.create({
      pendingTriggersResolver: createD1AiAgentBotPendingTriggersResolver(db),
      triggerClaimedStore: createD1AiAgentBotTriggerClaimedStore(db),
      triggersHandledStore: createD1AiAgentBotTriggersHandledStore(db),
      ...shared,
    }),
    runFollowups: RunAiAgentFollowupsUseCase.create({
      dueFollowupsResolver: createD1AiAgentBotDueFollowupsResolver(db),
      followupClaimedStore: createD1AiAgentBotFollowupClaimedStore(db),
      followupsHandledStore: createD1AiAgentBotFollowupsHandledStore(db),
      ...shared,
    }),
    postMusing: PostAiAgentMusingUseCase.create({
      memoriesResolverBySubject: shared.memoriesResolverBySubject,
      memoryChangedStore: shared.memoryChangedStore,
      chatModel,
      now: Instant.now,
    }),
  } as const;
};

export type AiAgentBotRuntime = NonNullable<Awaited<ReturnType<typeof createAiAgentBotRuntime>>>;
