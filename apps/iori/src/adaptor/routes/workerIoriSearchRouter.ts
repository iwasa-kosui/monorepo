import type { RequestContext } from '@fedify/fedify';
import { Result } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';
import { type Context, Hono } from 'hono';

import type { ActorResolverByUserId } from '../../domain/actor/actor.ts';
import { ActorId } from '../../domain/actor/actorId.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import type { PostsWithAuthorResolverByPostIds } from '../../domain/post/post.ts';
import type { PostId } from '../../domain/post/postId.ts';
import {
  DEFAULT_QUERY_LIMIT,
  MAX_QUERY_LIMIT,
  TimelineSearchQuery,
} from '../../domain/timelineSearch/timelineSearchQuery.ts';
import { timedOut, withTimeout } from '../../helper/withTimeout.ts';
import type { ResolveRemoteAccountUseCase } from '../../useCase/resolveRemoteAccount.ts';
import type { ResolveRemotePostUseCase } from '../../useCase/resolveRemotePost.ts';
import type { SearchTimelineUseCase, TimelineSearchExpansion } from '../../useCase/searchTimeline.ts';
import type { Account, Status } from '../mastodon/entities.ts';
import type { StatusAssembler, StatusSource } from '../mastodon/statusAssembler.ts';
import { actorNotFound, handleInternalError, internalServerError } from './helper/mastodonErrors.ts';
import { isTrue } from './helper/mastodonPage.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';

export type WorkerIoriSearchRouterDeps = Readonly<{
  authn: MastodonAuthn;
  actorResolverByUserId: ActorResolverByUserId;
  searchTimeline: SearchTimelineUseCase;
  postsWithAuthorResolverByPostIds: PostsWithAuthorResolverByPostIds;
  statusAssembler: StatusAssembler;
  resolveRemoteAccountUseCase: ResolveRemoteAccountUseCase;
  resolveRemotePostUseCase: ResolveRemotePostUseCase;
  createContext: (request: Request) => RequestContext<unknown>;
}>;

export type IoriSearchStatusesResponse = Readonly<{
  statuses: Status[];
  terms: Readonly<{ original: string[]; expanded: string[] }>;
  dropped_original: string[];
  expansion: TimelineSearchExpansion;
}>;

export type MastodonSearchResponse = Readonly<{
  accounts: Account[];
  statuses: Status[];
  hashtags: [];
}>;

type SearchedStatuses = Readonly<{
  statuses: Status[];
  terms: IoriSearchStatusesResponse['terms'];
  droppedOriginal: ReadonlyArray<string>;
  expansion: TimelineSearchExpansion;
  serverTiming: string;
}>;

const ACCOUNTS_TIMEOUT_MS = 10_000;

const invalidToken = { error: 'The access token is invalid' } as const;
const readSearch = Scope.orThrow('read:search');
const searchTypes: ReadonlyArray<string> = ['accounts', 'hashtags', 'statuses'];
const integerPattern = /^-?\d+$/;
const httpsUrlPattern = /^https:\/\/\S+$/i;
const acctPattern = /^@?([A-Za-z0-9_](?:[A-Za-z0-9_.-]*[A-Za-z0-9_])?)@([A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)$/;

const validationFailed = (field: string) => ({ error: `Validation failed: ${field}` }) as const;

const strictLimit = (limit: string | undefined): number | undefined => limit === undefined ? undefined : Number(limit);

const clampedLimit = (limit: string | undefined): number | undefined => {
  if (limit === undefined) {
    return undefined;
  }
  const value = limit.trim() === '' ? Number.NaN : Number(limit);
  return Number.isNaN(value) ? DEFAULT_QUERY_LIMIT : Math.min(MAX_QUERY_LIMIT, Math.max(1, Math.trunc(value)));
};

const parseQuery = (
  c: Context<MastodonAuthEnv>,
  limitOf: (limit: string | undefined) => number | undefined,
): Result<TimelineSearchQuery, 'q' | 'limit'> => {
  const text = c.req.query('q') ?? '';
  const parsed = TimelineSearchQuery.of({ text, limit: limitOf(c.req.query('limit')) });
  if (parsed.ok) {
    return parsed;
  }
  return Result.err(TimelineSearchQuery.of({ text }).ok ? 'limit' : 'q');
};

const remoteUrlOf = (q: string, ownHost: string): string | undefined => {
  if (!httpsUrlPattern.test(q)) {
    return undefined;
  }
  try {
    const url = new URL(q);
    if (url.username !== '' || url.password !== '') {
      return undefined;
    }
    return url.host.toLowerCase() === ownHost.toLowerCase() ? undefined : q;
  } catch {
    return undefined;
  }
};

const remoteHandleOf = (q: string, ownHost: string): string | undefined => {
  const acct = acctPattern.exec(q.replace(/^acct:/i, ''));
  if (acct !== null) {
    const [, username, host] = acct;
    return host!.toLowerCase() === ownHost.toLowerCase() ? undefined : `${username}@${host}`;
  }
  return remoteUrlOf(q, ownHost);
};

const formatTiming = (searchMs: number, assembleMs: number, totalMs: number): string =>
  `search;dur=${searchMs}, assemble;dur=${assembleMs}, total;dur=${totalMs}`;

export const createWorkerIoriSearchRouter = ({
  authn,
  actorResolverByUserId,
  searchTimeline,
  postsWithAuthorResolverByPostIds,
  statusAssembler,
  resolveRemoteAccountUseCase,
  resolveRemotePostUseCase,
  createContext,
}: WorkerIoriSearchRouterDeps): Hono<MastodonAuthEnv> => {
  const resolveAccounts = async (c: Context<MastodonAuthEnv>): Promise<Result<Account[], Response>> => {
    const userId = getMastodonPrincipal(c)?.userId;
    if (userId === null || userId === undefined) {
      return Result.err(c.json(invalidToken, 401));
    }
    const handle = remoteHandleOf((c.req.query('q') ?? '').trim(), new URL(c.req.url).host);
    if (!isTrue(c.req.query('resolve')) || handle === undefined) {
      return Result.ok([]);
    }
    const resolved = await resolveRemoteAccountUseCase.run({ userId, handle, request: c.req.raw });
    if (!resolved.ok) {
      return resolved.err.type === 'UserNotFoundError' ? Result.err(c.json(actorNotFound, 422)) : Result.ok([]);
    }
    return Result.ok(await statusAssembler.assembleAccounts({ actorIds: [resolved.val], requestUrl: c.req.url }));
  };

  const resolveAccountsOrEmpty = async (c: Context<MastodonAuthEnv>): Promise<Result<Account[], Response>> => {
    try {
      const resolved = await withTimeout(resolveAccounts(c), ACCOUNTS_TIMEOUT_MS);
      if (resolved === timedOut) {
        getLogger().warn('Timed out while resolving remote accounts for search');
        return Result.ok([]);
      }
      return resolved;
    } catch (error) {
      getLogger().warn(`Failed to resolve remote accounts for search: ${String(error)}`);
      return Result.ok([]);
    }
  };

  const remotePostUrlOf = (c: Context<MastodonAuthEnv>): string | undefined =>
    isTrue(c.req.query('resolve')) ? remoteUrlOf((c.req.query('q') ?? '').trim(), new URL(c.req.url).host) : undefined;

  const resolvePostId = async (c: Context<MastodonAuthEnv>, url: string): Promise<PostId | undefined> => {
    const userId = getMastodonPrincipal(c)?.userId;
    if (userId === null || userId === undefined) {
      return undefined;
    }
    try {
      const resolved = await resolveRemotePostUseCase.run({ userId, url, ctx: createContext(c.req.raw) });
      return resolved.ok ? resolved.val : undefined;
    } catch (error) {
      getLogger().warn(`Failed to resolve a remote post for search: ${String(error)}`);
      return undefined;
    }
  };

  const resolveStatus = async (c: Context<MastodonAuthEnv>, url: string): Promise<Result<Status[], Response>> => {
    const userId = getMastodonPrincipal(c)?.userId;
    if (userId === null || userId === undefined) {
      return Result.err(c.json(invalidToken, 401));
    }
    const actor = await actorResolverByUserId.resolve(userId);
    if (!actor.ok || actor.val === undefined) {
      return Result.err(c.json(actorNotFound, 422));
    }
    const viewerActorId = actor.val.id;
    const postId = await resolvePostId(c, url);
    if (postId === undefined) {
      return Result.ok([]);
    }
    const resolved = await postsWithAuthorResolverByPostIds.resolve({
      postIds: [postId],
      currentActorId: viewerActorId,
      onlyVisibleToViewer: true,
    });
    const post = resolved.ok ? resolved.val.get(postId) : undefined;
    if (post === undefined) {
      return Result.ok([]);
    }
    return Result.ok(
      await statusAssembler.assemble({
        sources: [{ type: 'post', post }],
        viewerActorId,
        requestUrl: c.req.url,
      }),
    );
  };

  const searchStatuses = async (
    c: Context<MastodonAuthEnv>,
    options: Readonly<{
      limitOf: (limit: string | undefined) => number | undefined;
      onlyActorId?: ActorId;
    }>,
  ): Promise<Result<SearchedStatuses, Response>> => {
    const startedAt = performance.now();
    const userId = getMastodonPrincipal(c)?.userId;
    if (userId === null || userId === undefined) {
      return Result.err(c.json(invalidToken, 401));
    }
    const query = parseQuery(c, options.limitOf);
    if (!query.ok) {
      return Result.err(c.json(validationFailed(query.err), 422));
    }
    const searched = await searchTimeline.run({ userId, query: query.val, onlyActorId: options.onlyActorId });
    const searchedAt = performance.now();
    if (!searched.ok) {
      if (searched.err.type === 'UserNotFoundError') {
        return Result.err(c.json(actorNotFound, 422));
      }
      throw new Error(`The timeline search failed: ${searched.err.type}`);
    }
    const { viewerActorId, postIds, terms, droppedOriginal, expansion } = searched.val;
    const resolved = await postsWithAuthorResolverByPostIds.resolve({ postIds, currentActorId: viewerActorId });
    if (!resolved.ok) {
      return Result.err(c.json(internalServerError, 500));
    }
    const posts = postIds.flatMap((postId) => {
      const post = resolved.val.get(postId);
      return post === undefined ? [] : [post];
    });
    const statuses = await statusAssembler.assemble({
      sources: posts.map((post): StatusSource => ({ type: 'post', post })),
      viewerActorId,
      requestUrl: c.req.url,
    });
    const finishedAt = performance.now();
    return Result.ok({
      statuses,
      terms: {
        original: terms.original.map((term) => term.normalized),
        expanded: terms.expanded.map((term) => term.normalized),
      },
      droppedOriginal,
      expansion,
      serverTiming: formatTiming(searchedAt - startedAt, finishedAt - searchedAt, finishedAt - startedAt),
    });
  };

  return new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .get('/iori/v1/search/statuses', authn.requireUser(readSearch), async (c) => {
      const searched = await searchStatuses(c, { limitOf: strictLimit });
      if (!searched.ok) {
        return searched.err;
      }
      const { statuses, terms, droppedOriginal, expansion, serverTiming } = searched.val;
      c.header('Server-Timing', serverTiming);
      const body: IoriSearchStatusesResponse = {
        statuses,
        terms,
        dropped_original: [...droppedOriginal],
        expansion,
      };
      return c.json(body);
    })
    .get('/v2/search', authn.requireUser(readSearch), async (c) => {
      const type = c.req.query('type');
      if (type !== undefined && !searchTypes.includes(type)) {
        return c.json(validationFailed('type'), 422);
      }
      const offset = c.req.query('offset');
      if (offset !== undefined && !integerPattern.test(offset)) {
        return c.json(validationFailed('offset'), 422);
      }
      const empty: MastodonSearchResponse = { accounts: [], statuses: [], hashtags: [] };
      const isPaging = (offset !== undefined && Number(offset) >= 1)
        || c.req.query('max_id') !== undefined
        || c.req.query('min_id') !== undefined;
      if (type === 'hashtags' || isPaging) {
        return c.json(empty);
      }
      const accountId = c.req.query('account_id');
      const onlyActorId = accountId === undefined ? undefined : ActorId.parse(accountId);
      const remotePostUrl = type === 'accounts' || onlyActorId !== undefined ? undefined : remotePostUrlOf(c);
      if (remotePostUrl !== undefined) {
        const [accounts, resolved] = await Promise.all([
          type === 'statuses' ? Result.ok<Account[]>([]) : resolveAccountsOrEmpty(c),
          resolveStatus(c, remotePostUrl),
        ]);
        if (!accounts.ok) {
          return accounts.err;
        }
        return resolved.ok ? c.json({ ...empty, accounts: accounts.val, statuses: resolved.val }) : resolved.err;
      }
      const accounts = type === 'statuses' ? Result.ok<Account[]>([]) : await resolveAccountsOrEmpty(c);
      if (!accounts.ok) {
        return accounts.err;
      }
      if (type === 'accounts') {
        return c.json({ ...empty, accounts: accounts.val });
      }
      if ((c.req.query('q') ?? '').trim() === '') {
        return c.json(validationFailed('q'), 400);
      }
      if (onlyActorId !== undefined && !onlyActorId.ok) {
        return c.json({ ...empty, accounts: accounts.val });
      }
      const searched = await searchStatuses(c, { limitOf: clampedLimit, onlyActorId: onlyActorId?.val });
      if (!searched.ok) {
        return searched.err;
      }
      // 配備後に検索1回の遅延を測るために付ける
      c.header('Server-Timing', searched.val.serverTiming);
      const body: MastodonSearchResponse = { accounts: accounts.val, statuses: searched.val.statuses, hashtags: [] };
      return c.json(body);
    });
};
