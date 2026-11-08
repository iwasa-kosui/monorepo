import { Hono } from 'hono';

import {
  BLUESKY_CROSSPOST_RECENT_FAILURES_LIMIT,
  type BlueskyCrosspostStatus,
  type BlueskyCrosspostStatusReportResolver,
  MAX_BLUESKY_CROSSPOST_ATTEMPTS,
  MAX_BLUESKY_DELETE_ATTEMPTS,
} from '../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import type { UserResolverByUsername } from '../../domain/user/user.ts';
import { Username } from '../../domain/user/username.ts';
import { DAILY_DIGEST_USERNAME } from '../../scheduled/digestTasks.ts';
import { toIsoString } from '../mastodon/time.ts';
import { handleInternalError, internalServerError } from './helper/mastodonErrors.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';

export type WorkerIoriBlueskyCrosspostStatusRouterDeps = Readonly<{
  authn: MastodonAuthn;
  userResolverByUsername: UserResolverByUsername;
  blueskyCrosspostStatusReportResolver: BlueskyCrosspostStatusReportResolver;
  blueskyCrosspostEnabled: boolean;
}>;

export type IoriBlueskyCrosspostStatusResponse = Readonly<{
  enabled: boolean;
  counts: Readonly<Record<BlueskyCrosspostStatus, number>>;
  exhausted: Readonly<{ failed: number; deleting: number }>;
  recentFailures: ReadonlyArray<
    Readonly<{
      postId: string;
      status: BlueskyCrosspostStatus;
      attempts: number;
      lastError: string | null;
      updatedAt: string;
    }>
  >;
}>;

const invalidToken = { error: 'The access token is invalid' } as const;
const forbidden = { error: 'Forbidden' } as const;
const readStatuses = Scope.orThrow('read:statuses');

export const createWorkerIoriBlueskyCrosspostStatusRouter = ({
  authn,
  userResolverByUsername,
  blueskyCrosspostStatusReportResolver,
  blueskyCrosspostEnabled,
}: WorkerIoriBlueskyCrosspostStatusRouterDeps): Hono<MastodonAuthEnv> =>
  new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .get('/iori/v1/bluesky/crossposts/status', authn.requireUser(readStatuses), async (c) => {
      const userId = getMastodonPrincipal(c)?.userId;
      if (userId === null || userId === undefined) return c.json(invalidToken, 401);
      const owner = await userResolverByUsername.resolve(Username.parseOrThrow(DAILY_DIGEST_USERNAME));
      if (!owner.ok) return c.json(internalServerError, 500);
      if (owner.val?.id !== userId) return c.json(forbidden, 403);
      const report = await blueskyCrosspostStatusReportResolver.resolve({
        maxAttempts: MAX_BLUESKY_CROSSPOST_ATTEMPTS,
        maxDeleteAttempts: MAX_BLUESKY_DELETE_ATTEMPTS,
        failuresLimit: BLUESKY_CROSSPOST_RECENT_FAILURES_LIMIT,
      });
      if (!report.ok) return c.json(internalServerError, 500);
      return c.json(
        {
          enabled: blueskyCrosspostEnabled,
          counts: report.val.counts,
          exhausted: report.val.exhausted,
          recentFailures: report.val.recentFailures.map(({ postId, status, attempts, lastError, updatedAt }) => ({
            postId,
            status,
            attempts,
            lastError,
            updatedAt: toIsoString(updatedAt),
          })),
        } satisfies IoriBlueskyCrosspostStatusResponse,
      );
    });
