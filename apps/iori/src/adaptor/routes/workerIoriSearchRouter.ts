import { Result } from '@iwasa-kosui/result';
import { type Context, Hono } from 'hono';

import { ActorId } from '../../domain/actor/actorId.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import type { PostsWithAuthorResolverByPostIds } from '../../domain/post/post.ts';
import {
  DEFAULT_QUERY_LIMIT,
  MAX_QUERY_LIMIT,
  TimelineSearchQuery,
} from '../../domain/timelineSearch/timelineSearchQuery.ts';
import type { SearchTimelineUseCase, TimelineSearchExpansion } from '../../useCase/searchTimeline.ts';
import type { Status } from '../mastodon/entities.ts';
import type { StatusAssembler, StatusSource } from '../mastodon/statusAssembler.ts';
import { actorNotFound, handleInternalError, internalServerError } from './helper/mastodonErrors.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';

export type WorkerIoriSearchRouterDeps = Readonly<{
  authn: MastodonAuthn;
  searchTimeline: SearchTimelineUseCase;
  postsWithAuthorResolverByPostIds: PostsWithAuthorResolverByPostIds;
  statusAssembler: StatusAssembler;
}>;

export type IoriSearchStatusesResponse = Readonly<{
  statuses: Status[];
  terms: Readonly<{ original: string[]; expanded: string[] }>;
  dropped_original: string[];
  expansion: TimelineSearchExpansion;
}>;

export type MastodonSearchResponse = Readonly<{
  accounts: [];
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

const invalidToken = { error: 'The access token is invalid' } as const;
const readSearch = Scope.orThrow('read:search');
const searchTypes: ReadonlyArray<string> = ['accounts', 'hashtags', 'statuses'];
const integerPattern = /^-?\d+$/;

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

const formatTiming = (searchMs: number, assembleMs: number, totalMs: number): string =>
  `search;dur=${searchMs}, assemble;dur=${assembleMs}, total;dur=${totalMs}`;

export const createWorkerIoriSearchRouter = ({
  authn,
  searchTimeline,
  postsWithAuthorResolverByPostIds,
  statusAssembler,
}: WorkerIoriSearchRouterDeps): Hono<MastodonAuthEnv> => {
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
      if (type === 'accounts' || type === 'hashtags' || isPaging) {
        return c.json(empty);
      }
      if ((c.req.query('q') ?? '').trim() === '') {
        return c.json(validationFailed('q'), 400);
      }
      const accountId = c.req.query('account_id');
      const onlyActorId = accountId === undefined ? undefined : ActorId.parse(accountId);
      if (onlyActorId !== undefined && !onlyActorId.ok) {
        return c.json(empty);
      }
      const searched = await searchStatuses(c, { limitOf: clampedLimit, onlyActorId: onlyActorId?.val });
      if (!searched.ok) {
        return searched.err;
      }
      // 配備後に検索1回の遅延を測るために付ける
      c.header('Server-Timing', searched.val.serverTiming);
      const body: MastodonSearchResponse = { accounts: [], statuses: searched.val.statuses, hashtags: [] };
      return c.json(body);
    });
};
