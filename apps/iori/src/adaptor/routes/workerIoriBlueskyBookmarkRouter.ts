import type { RA } from '@iwasa-kosui/result';
import { type Context, Hono } from 'hono';

import type { BlueskyBookmarkTargetNotFound } from '../../domain/blueskyTimeline/blueskyBookmark.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import { isBlueskyBookmarkUnavailable } from '../../ports/blueskyBookmarkReader.ts';
import type { BlueskyClientError } from '../../ports/blueskyClient.ts';
import type { BookmarkBlueskyPostUseCase } from '../../useCase/bookmarkBlueskyPost.ts';
import type { ListBlueskyBookmarksUseCase } from '../../useCase/listBlueskyBookmarks.ts';
import type { UnbookmarkBlueskyPostUseCase } from '../../useCase/unbookmarkBlueskyPost.ts';
import { logBlueskyFailure } from './helper/blueskyFailureLog.ts';
import { type BlueskyPortsForUser, userIdOf } from './helper/blueskyUserPorts.ts';
import { handleInternalError } from './helper/mastodonErrors.ts';
import { bodyString, readRequestBody } from './helper/requestBody.ts';
import { requireSameOriginForCookie } from './helper/sameOrigin.ts';
import { type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';
import {
  clientFailure,
  type IoriBlueskyTimelineItemBody,
  postTargetOf,
  resolveViewerDid,
  toItemBody,
} from './workerIoriBlueskyRouter.ts';

export type WorkerIoriBlueskyBookmarkUserDeps = Readonly<{
  bookmarkBlueskyPostUseCase: BookmarkBlueskyPostUseCase | undefined;
  unbookmarkBlueskyPostUseCase: UnbookmarkBlueskyPostUseCase | undefined;
  listBlueskyBookmarksUseCase: ListBlueskyBookmarksUseCase | undefined;
  viewerDid: (() => RA<string, BlueskyClientError>) | undefined;
}>;

export type WorkerIoriBlueskyBookmarkRouterDeps = Readonly<{
  authn: MastodonAuthn;
  forUser: BlueskyPortsForUser<WorkerIoriBlueskyBookmarkUserDeps>;
}>;

export type IoriBlueskyBookmarkResponse = Readonly<{ bookmarked: boolean }>;

export type IoriBlueskyBookmarksResponse = Readonly<{
  items: readonly IoriBlueskyTimelineItemBody[];
  cursor: string | null;
}>;

export const BLUESKY_BOOKMARKS_UNAVAILABLE_ERROR = 'Bluesky bookmarks unavailable';

const readBookmarks = Scope.orThrow('read:bookmarks');
const writeBookmarks = Scope.orThrow('write:bookmarks');
const disabled = { error: 'Bluesky timeline is disabled' } as const;

const failure = (c: Context, error: BlueskyClientError | BlueskyBookmarkTargetNotFound) => {
  if (error.type === 'BlueskyBookmarkTargetNotFound') return c.json({ error: 'Record not found' }, 404);
  if (isBlueskyBookmarkUnavailable(error)) {
    logBlueskyFailure(error, 502);
    return c.json({ error: BLUESKY_BOOKMARKS_UNAVAILABLE_ERROR }, 502);
  }
  return clientFailure(c, error);
};

export const createWorkerIoriBlueskyBookmarkRouter = ({
  authn,
  forUser,
}: WorkerIoriBlueskyBookmarkRouterDeps): Hono<MastodonAuthEnv> =>
  new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .get('/iori/v1/bluesky/bookmarks', authn.requireUser(readBookmarks), async (c) => {
      const { listBlueskyBookmarksUseCase, viewerDid } = await forUser(userIdOf(c));
      if (listBlueskyBookmarksUseCase === undefined) return c.json(disabled, 409);
      const page = await listBlueskyBookmarksUseCase.run({ cursor: c.req.query('cursor') || undefined });
      if (!page.ok) return failure(c, page.err);
      const viewer = await resolveViewerDid(viewerDid);
      return c.json(
        {
          items: page.val.items.map((item) => toItemBody(item, viewer)),
          cursor: page.val.cursor ?? null,
        } satisfies IoriBlueskyBookmarksResponse,
      );
    })
    .post(
      '/iori/v1/bluesky/bookmarks',
      requireSameOriginForCookie,
      authn.requireUser(writeBookmarks),
      async (c) => {
        const { bookmarkBlueskyPostUseCase } = await forUser(userIdOf(c));
        if (bookmarkBlueskyPostUseCase === undefined) return c.json(disabled, 409);
        const body = await readRequestBody(c);
        const resolved = postTargetOf(bodyString(body, 'feedItemId'), bodyString(body, 'uri'));
        if ('invalid' in resolved) return c.json({ error: `Validation failed: ${resolved.invalid}` }, 400);
        const bookmarked = await bookmarkBlueskyPostUseCase.run(resolved.target);
        return bookmarked.ok
          ? c.json(bookmarked.val satisfies IoriBlueskyBookmarkResponse)
          : failure(c, bookmarked.err);
      },
    )
    .delete(
      '/iori/v1/bluesky/bookmarks',
      requireSameOriginForCookie,
      authn.requireUser(writeBookmarks),
      async (c) => {
        const { unbookmarkBlueskyPostUseCase } = await forUser(userIdOf(c));
        if (unbookmarkBlueskyPostUseCase === undefined) return c.json(disabled, 409);
        const resolved = postTargetOf(c.req.query('feedItemId'), c.req.query('uri'));
        if ('invalid' in resolved) return c.json({ error: `Validation failed: ${resolved.invalid}` }, 400);
        const unbookmarked = await unbookmarkBlueskyPostUseCase.run(resolved.target);
        return unbookmarked.ok
          ? c.json(unbookmarked.val satisfies IoriBlueskyBookmarkResponse)
          : failure(c, unbookmarked.err);
      },
    );
