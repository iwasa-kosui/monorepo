import { Hono } from 'hono';

import type { XFeedEntry } from '../../domain/feedEntry/xFeedEntry.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import type { GetXFeedEntriesUseCase } from '../../useCase/getXFeedEntries.ts';
import type { IsDigestOwner } from '../../useCase/isDigestOwner.ts';
import type { RefreshXPostsUseCase } from '../../useCase/refreshXPosts.ts';
import { toIsoString } from '../mastodon/time.ts';
import { handleInternalError } from './helper/mastodonErrors.ts';
import { parseLimit, xPostsLimits } from './helper/mastodonPage.ts';
import { requireSameOriginForCookie } from './helper/sameOrigin.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';

export type WorkerIoriXPostsRouterDeps = Readonly<{
  authn: MastodonAuthn;
  getXFeedEntriesUseCase: GetXFeedEntriesUseCase;
  refreshXPostsUseCase: RefreshXPostsUseCase | undefined;
  isDigestOwner: IsDigestOwner;
}>;

export type IoriXPostBody = Readonly<{
  feedEntryId: string;
  sourceTitle: string;
  text: string;
  url: string;
  postedAt: string;
}>;

export type IoriXPostsResponse = Readonly<{ posts: ReadonlyArray<IoriXPostBody>; fetchEnabled: boolean }>;

export type IoriXPostsRefreshResponse = Readonly<{ sources: number; failed: number; collected: number }>;

const forbidden = { error: 'Forbidden' } as const;
const readStatuses = Scope.orThrow('read:statuses');
const writeAccounts = Scope.orThrow('write:accounts');

const toPostBody = ({ feedEntryId, sourceTitle, text, url, postedAt }: XFeedEntry): IoriXPostBody => ({
  feedEntryId,
  sourceTitle,
  text,
  url,
  postedAt: toIsoString(postedAt),
});

export const createWorkerIoriXPostsRouter = ({
  authn,
  getXFeedEntriesUseCase,
  refreshXPostsUseCase,
  isDigestOwner,
}: WorkerIoriXPostsRouterDeps): Hono<MastodonAuthEnv> =>
  new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .use('/iori/v1/x-posts/*', async (c, next) => {
      await next();
      c.res.headers.set('Cache-Control', 'private, no-store');
      c.res.headers.set('X-Robots-Tag', 'noindex');
    })
    .get('/iori/v1/x-posts', authn.requireUser(readStatuses), async (c) => {
      if (!(await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined))) return c.json(forbidden, 403);
      const entries = await getXFeedEntriesUseCase.run({ limit: parseLimit(c.req.query('limit'), xPostsLimits) });
      return c.json(
        {
          posts: entries.val.map(toPostBody),
          fetchEnabled: refreshXPostsUseCase !== undefined,
        } satisfies IoriXPostsResponse,
      );
    })
    .post('/iori/v1/x-posts/refresh', requireSameOriginForCookie, authn.requireUser(writeAccounts), async (c) => {
      if (!(await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined))) return c.json(forbidden, 403);
      if (refreshXPostsUseCase === undefined) return c.json({ error: 'X fetch is disabled' }, 409);
      const refreshed = await refreshXPostsUseCase.run();
      if (!refreshed.ok) {
        c.header('Retry-After', String(refreshed.err.detail.retryAfterSeconds));
        return c.json({ error: refreshed.err.message }, 429);
      }
      return c.json(refreshed.val satisfies IoriXPostsRefreshResponse);
    });
