import { type Context, Hono } from 'hono';

import {
  blueskyBlockUri,
  BlueskyDid,
  BlueskyReportCategory,
} from '../../domain/blueskyModeration/blueskyModeration.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import { blueskyPostUriPattern } from '../../helper/blueskyUrl.ts';
import type { BlueskyModerationUseCases } from '../../runtime/blueskyModeration.ts';
import type { IsDigestOwner } from '../../useCase/isDigestOwner.ts';
import { handleInternalError } from './helper/mastodonErrors.ts';
import { bodyString, readRequestBody } from './helper/requestBody.ts';
import { requireSameOriginForCookie } from './helper/sameOrigin.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';
import { clientFailure } from './workerIoriBlueskyRouter.ts';

export type WorkerIoriBlueskyModerationRouterDeps = Readonly<{
  authn: MastodonAuthn;
  blueskyModeration: BlueskyModerationUseCases | undefined;
  isDigestOwner: IsDigestOwner;
}>;

export type IoriBlueskyModerationStateResponse = Readonly<{ muted: boolean; blockUri: string | null }>;
export type IoriBlueskyMuteResponse = Readonly<{ muted: boolean }>;
export type IoriBlueskyThreadMuteResponse = Readonly<{ threadMuted: boolean }>;
export type IoriBlueskyBlockResponse = Readonly<{ blockUri: string | null }>;

const readStatuses = Scope.orThrow('read:statuses');
const writeMutes = Scope.orThrow('write:mutes');
const writeBlocks = Scope.orThrow('write:blocks');
const writeReports = Scope.orThrow('write:reports');
const forbidden = { error: 'Forbidden' } as const;
const disabled = { error: 'Bluesky timeline is disabled' } as const;

const validDid = (value: string | undefined): value is string => value !== undefined && BlueskyDid.parse(value).ok;

const validPostUri = (value: string | undefined): value is string =>
  value !== undefined && blueskyPostUriPattern.test(value);

const invalid = (c: Context, field: string) => c.json({ error: `Validation failed: ${field}` }, 400);

export const createWorkerIoriBlueskyModerationRouter = ({
  authn,
  blueskyModeration,
  isDigestOwner,
}: WorkerIoriBlueskyModerationRouterDeps): Hono<MastodonAuthEnv> => {
  const isOwner = (c: Context<MastodonAuthEnv>) => isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined);

  return new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .get('/iori/v1/bluesky/moderation/:did', authn.requireUser(readStatuses), async (c) => {
      if (!await isOwner(c)) return c.json(forbidden, 403);
      if (blueskyModeration === undefined) return c.json(disabled, 409);
      const did = c.req.param('did');
      if (!validDid(did)) return invalid(c, 'did');
      const state = await blueskyModeration.getState.run({ did });
      return state.ok
        ? c.json({ muted: state.val.muted, blockUri: state.val.blockUri } satisfies IoriBlueskyModerationStateResponse)
        : clientFailure(c, state.err);
    })
    .post('/iori/v1/bluesky/mutes', requireSameOriginForCookie, authn.requireUser(writeMutes), async (c) => {
      if (!await isOwner(c)) return c.json(forbidden, 403);
      if (blueskyModeration === undefined) return c.json(disabled, 409);
      const did = bodyString(await readRequestBody(c), 'did');
      if (!validDid(did)) return invalid(c, 'did');
      const muted = await blueskyModeration.mute.run({ did });
      return muted.ok ? c.json(muted.val satisfies IoriBlueskyMuteResponse) : clientFailure(c, muted.err);
    })
    .delete('/iori/v1/bluesky/mutes', requireSameOriginForCookie, authn.requireUser(writeMutes), async (c) => {
      if (!await isOwner(c)) return c.json(forbidden, 403);
      if (blueskyModeration === undefined) return c.json(disabled, 409);
      const did = c.req.query('did');
      if (!validDid(did)) return invalid(c, 'did');
      const unmuted = await blueskyModeration.unmute.run({ did });
      return unmuted.ok ? c.json(unmuted.val satisfies IoriBlueskyMuteResponse) : clientFailure(c, unmuted.err);
    })
    .post('/iori/v1/bluesky/thread-mutes', requireSameOriginForCookie, authn.requireUser(writeMutes), async (c) => {
      if (!await isOwner(c)) return c.json(forbidden, 403);
      if (blueskyModeration === undefined) return c.json(disabled, 409);
      const root = bodyString(await readRequestBody(c), 'root');
      if (!validPostUri(root)) return invalid(c, 'root');
      const muted = await blueskyModeration.muteThread.run({ root });
      return muted.ok ? c.json(muted.val satisfies IoriBlueskyThreadMuteResponse) : clientFailure(c, muted.err);
    })
    .delete('/iori/v1/bluesky/thread-mutes', requireSameOriginForCookie, authn.requireUser(writeMutes), async (c) => {
      if (!await isOwner(c)) return c.json(forbidden, 403);
      if (blueskyModeration === undefined) return c.json(disabled, 409);
      const root = c.req.query('root');
      if (!validPostUri(root)) return invalid(c, 'root');
      const unmuted = await blueskyModeration.unmuteThread.run({ root });
      return unmuted.ok ? c.json(unmuted.val satisfies IoriBlueskyThreadMuteResponse) : clientFailure(c, unmuted.err);
    })
    .post('/iori/v1/bluesky/blocks', requireSameOriginForCookie, authn.requireUser(writeBlocks), async (c) => {
      if (!await isOwner(c)) return c.json(forbidden, 403);
      if (blueskyModeration === undefined) return c.json(disabled, 409);
      const did = bodyString(await readRequestBody(c), 'did');
      if (!validDid(did)) return invalid(c, 'did');
      const blocked = await blueskyModeration.block.run({ did });
      return blocked.ok ? c.json(blocked.val satisfies IoriBlueskyBlockResponse) : clientFailure(c, blocked.err);
    })
    .delete('/iori/v1/bluesky/blocks', requireSameOriginForCookie, authn.requireUser(writeBlocks), async (c) => {
      if (!await isOwner(c)) return c.json(forbidden, 403);
      if (blueskyModeration === undefined) return c.json(disabled, 409);
      const did = c.req.query('did');
      if (!validDid(did)) return invalid(c, 'did');
      const blockUri = c.req.query('blockUri');
      if (blockUri !== undefined && blueskyBlockUri(blockUri) === undefined) return invalid(c, 'blockUri');
      const unblocked = await blueskyModeration.unblock.run({ did, blockUri });
      return unblocked.ok
        ? c.json(unblocked.val satisfies IoriBlueskyBlockResponse)
        : clientFailure(c, unblocked.err);
    })
    .post('/iori/v1/bluesky/reports', requireSameOriginForCookie, authn.requireUser(writeReports), async (c) => {
      if (!await isOwner(c)) return c.json(forbidden, 403);
      if (blueskyModeration === undefined) return c.json(disabled, 409);
      const body = await readRequestBody(c);
      const did = bodyString(body, 'did');
      if (!validDid(did)) return invalid(c, 'did');
      const category = BlueskyReportCategory.parse(body.category);
      if (!category.ok) return invalid(c, 'category');
      const comment = body.comment === undefined ? '' : bodyString(body, 'comment');
      if (comment === undefined) return invalid(c, 'comment');
      const reported = await blueskyModeration.report.run({ did, category: category.val, comment });
      if (reported.ok) return c.json({}, 201);
      return reported.err.type === 'BlueskyModerationValidationError'
        ? invalid(c, reported.err.field)
        : clientFailure(c, reported.err);
    });
};
