import { Hono } from 'hono';

import type { XFeedEntry } from '../../domain/feedEntry/xFeedEntry.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import type { GetXFeedEntriesUseCase } from '../../useCase/getXFeedEntries.ts';
import { toIsoString } from '../mastodon/time.ts';
import { handleInternalError } from './helper/mastodonErrors.ts';
import { parseLimit, xPostsLimits } from './helper/mastodonPage.ts';
import type { MastodonAuthEnv, MastodonAuthn } from './mastodonAuthn.ts';

export type WorkerIoriXPostsRouterDeps = Readonly<{
  authn: MastodonAuthn;
  getXFeedEntriesUseCase: GetXFeedEntriesUseCase;
}>;

export type IoriXPostBody = Readonly<{
  feedEntryId: string;
  sourceTitle: string;
  text: string;
  url: string;
  postedAt: string;
}>;

export type IoriXPostsResponse = Readonly<{ posts: ReadonlyArray<IoriXPostBody> }>;

const readStatuses = Scope.orThrow('read:statuses');

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
}: WorkerIoriXPostsRouterDeps): Hono<MastodonAuthEnv> =>
  new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .use('/iori/v1/x-posts', async (c, next) => {
      await next();
      c.res.headers.set('Cache-Control', 'private, no-store');
      c.res.headers.set('X-Robots-Tag', 'noindex');
    })
    .get('/iori/v1/x-posts', authn.requireUser(readStatuses), async (c) => {
      const entries = await getXFeedEntriesUseCase.run({ limit: parseLimit(c.req.query('limit'), xPostsLimits) });
      return c.json({ posts: entries.val.map(toPostBody) } satisfies IoriXPostsResponse);
    });
