import { Hono } from 'hono';

import { SummaryTarget } from '../../domain/aiSummary/summaryTarget.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import type { PostsWithAuthorResolverByPostIds } from '../../domain/post/post.ts';
import type { SummarizeTimelineUseCase } from '../../useCase/summarizeTimeline.ts';
import type { Status } from '../mastodon/entities.ts';
import type { StatusAssembler, StatusSource } from '../mastodon/statusAssembler.ts';
import { actorNotFound, handleInternalError, internalServerError } from './helper/mastodonErrors.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';

export type WorkerIoriSummaryRouterDeps = Readonly<{
  authn: MastodonAuthn;
  summarizeTimeline: SummarizeTimelineUseCase;
  postsWithAuthorResolverByPostIds: PostsWithAuthorResolverByPostIds;
  statusAssembler: StatusAssembler;
}>;

export type IoriTimelineSummaryResponse = Readonly<{
  summary: string | null;
  source_status_ids: string[];
  citations: Array<{ n: number; status: Status }>;
  used_status_count: number;
  excluded_non_public_count: number;
  truncated: boolean;
  model: string;
  remaining_today: number;
}>;

const invalidToken = { error: 'The access token is invalid' } as const;
const summaryFailed = { error: 'The summary could not be generated' } as const;
const readStatuses = Scope.orThrow('read:statuses');

const validationFailed = (field: string) => ({ error: `Validation failed: ${field}` }) as const;

const formatTiming = (gatherMs: number, aiMs: number, totalMs: number): string =>
  `gather;dur=${gatherMs}, ai;dur=${aiMs}, total;dur=${totalMs}`;

export const createWorkerIoriSummaryRouter = ({
  authn,
  summarizeTimeline,
  postsWithAuthorResolverByPostIds,
  statusAssembler,
}: WorkerIoriSummaryRouterDeps): Hono<MastodonAuthEnv> =>
  new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .post('/iori/v1/timeline/summaries', authn.requireUser(readStatuses), async (c) => {
      const startedAt = performance.now();
      const userId = getMastodonPrincipal(c)?.userId;
      if (userId === null || userId === undefined) {
        return c.json(invalidToken, 401);
      }
      const body: unknown = await c.req.json().catch(() => undefined);
      const target = SummaryTarget.parse(body, Instant.now());
      if (!target.ok) {
        return c.json(validationFailed(target.err.field), 422);
      }
      const summarized = await summarizeTimeline.run({ userId, target: target.val });
      if (!summarized.ok) {
        switch (summarized.err.type) {
          case 'UserNotFoundError':
            return c.json(actorNotFound, 422);
          case 'SummaryLimitExceededError':
            c.header('Retry-After', String(summarized.err.retryAfterSeconds));
            return c.json({ error: summarized.err.message }, 429);
          case 'AiError':
          case 'SummaryTimeoutError':
          case 'SummaryAiUnavailableError':
            console.warn(`timeline summary failed: ${summarized.err.type}: ${summarized.err.message.slice(0, 200)}`);
            return c.json(summaryFailed, 502);
        }
      }
      const result = summarized.val;
      const postIds = result.citations.map(({ postId }) => postId);
      const resolved = postIds.length === 0
        ? undefined
        : await postsWithAuthorResolverByPostIds.resolve({ postIds, currentActorId: result.viewerActorId });
      if (resolved !== undefined && !resolved.ok) {
        return c.json(internalServerError, 500);
      }
      const cited = result.citations.flatMap(({ n, postId }) => {
        const post = resolved?.val.get(postId);
        return post === undefined ? [] : [{ n, post }];
      });
      const statuses = await statusAssembler.assemble({
        sources: cited.map(({ post }): StatusSource => ({ type: 'post', post })),
        viewerActorId: result.viewerActorId,
        requestUrl: c.req.url,
      });
      const statusById = new Map(statuses.map((status) => [status.id, status]));
      c.header('Server-Timing', formatTiming(result.gatherMs, result.aiMs, performance.now() - startedAt));
      const response: IoriTimelineSummaryResponse = {
        summary: result.summary,
        source_status_ids: [...result.sourcePostIds],
        citations: cited.flatMap(({ n, post }) => {
          const status = statusById.get(post.postId);
          return status === undefined ? [] : [{ n, status }];
        }),
        used_status_count: result.usedPostCount,
        excluded_non_public_count: result.excludedNonPublicCount,
        truncated: result.truncated,
        model: result.model,
        remaining_today: result.remainingToday,
      };
      return c.json(response);
    });
