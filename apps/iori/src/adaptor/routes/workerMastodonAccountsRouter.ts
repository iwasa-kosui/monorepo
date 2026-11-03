import { Hono } from 'hono';

import type {
  ActorIdsResolverByFollowerIdWithPagination,
  ActorIdsResolverByFollowingIdWithPagination,
} from '../../domain/actor/accountProfile.ts';
import type { ActorResolverByUserId } from '../../domain/actor/actor.ts';
import { ActorId } from '../../domain/actor/actorId.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import type { PageRequest } from '../../domain/page/page.ts';
import type { AccountStatusItemsResolverByActorId } from '../../domain/post/accountStatusItem.ts';
import type { ActorResolverById } from '../d1/actor/actorResolverById.ts';
import type { Account } from '../mastodon/entities.ts';
import { isRemoteSource, type StatusAssembler, statusSourceId } from '../mastodon/statusAssembler.ts';
import { handleInternalError, internalServerError } from './helper/mastodonErrors.ts';
import {
  accountListLimits,
  isTrue,
  parsePageRequest,
  respondWithPage,
  timelineLimits,
  toNewestFirst,
} from './helper/mastodonPage.ts';
import { resolveViewer } from './helper/mastodonViewer.ts';
import {
  getMastodonPrincipal,
  type MastodonAuthEnv,
  type MastodonAuthn,
  rejectUnlessTokenScope,
} from './mastodonAuthn.ts';

export type WorkerMastodonAccountsRouterDeps = Readonly<{
  authn: MastodonAuthn;
  actorResolverByUserId: ActorResolverByUserId;
  actorResolverById: ActorResolverById;
  accountStatusItemsResolverByActorId: AccountStatusItemsResolverByActorId;
  actorIdsResolverByFollowerId: ActorIdsResolverByFollowerIdWithPagination;
  actorIdsResolverByFollowingId: ActorIdsResolverByFollowingIdWithPagination;
  statusAssembler: StatusAssembler;
}>;

type ActorIdsPageResolver = Readonly<{
  resolve: (input: Readonly<{ actorId: ActorId; page: PageRequest }>) => PromiseLike<
    Readonly<{ ok: boolean; val?: ReadonlyArray<ActorId> }>
  >;
}>;

const recordNotFound = { error: 'Record not found' } as const;
const readAccounts = Scope.orThrow('read:accounts');
const readStatuses = Scope.orThrow('read:statuses');

const accountIdPattern = '[0-9a-fA-F-]+';

const isRemoteAccount = (account: Account): boolean => account.acct.includes('@');

export const createWorkerMastodonAccountsRouter = ({
  authn,
  actorResolverByUserId,
  actorResolverById,
  accountStatusItemsResolverByActorId,
  actorIdsResolverByFollowerId,
  actorIdsResolverByFollowingId,
  statusAssembler,
}: WorkerMastodonAccountsRouterDeps): Hono<MastodonAuthEnv> => {
  const listAccounts = (resolver: ActorIdsPageResolver) => async (c: Parameters<typeof respondWithPage>[0]) => {
    const rejection = rejectUnlessTokenScope(c, getMastodonPrincipal(c), [readAccounts]);
    if (rejection !== undefined) {
      return rejection;
    }
    const id = ActorId.parse(c.req.param('id'));
    if (!id.ok) {
      return c.json(recordNotFound, 404);
    }
    const page = parsePageRequest(c, accountListLimits);
    const [owner, related] = await Promise.all([
      actorResolverById.resolve(id.val),
      resolver.resolve({ actorId: id.val, page }),
    ]);
    if (!owner.ok || !related.ok) {
      return c.json(internalServerError, 500);
    }
    if (owner.val === undefined) {
      return c.json(recordNotFound, 404);
    }
    const actorIds = toNewestFirst(related.val ?? [], page);
    const accounts: Account[] = await statusAssembler.assembleAccounts({ actorIds, requestUrl: c.req.url });
    return respondWithPage(c, accounts, actorIds);
  };

  return new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .get(`/v1/accounts/:id{${accountIdPattern}}`, authn.optionalAuth, async (c) => {
      const rejection = rejectUnlessTokenScope(c, getMastodonPrincipal(c), [readAccounts]);
      if (rejection !== undefined) {
        return rejection;
      }
      const id = ActorId.parse(c.req.param('id'));
      if (!id.ok) {
        return c.json(recordNotFound, 404);
      }
      const [account] = await statusAssembler.assembleAccounts({ actorIds: [id.val], requestUrl: c.req.url });
      return account === undefined ? c.json(recordNotFound, 404) : c.json(account);
    })
    .get(`/v1/accounts/:id{${accountIdPattern}}/statuses`, authn.optionalAuth, async (c) => {
      const principal = getMastodonPrincipal(c);
      const rejection = rejectUnlessTokenScope(c, principal, [readStatuses]);
      if (rejection !== undefined) {
        return rejection;
      }
      const id = ActorId.parse(c.req.param('id'));
      if (!id.ok) {
        return c.json(recordNotFound, 404);
      }
      const page = parsePageRequest(c, timelineLimits);
      const viewer = await resolveViewer(actorResolverByUserId, principal);
      if (!viewer.ok) {
        return c.json(internalServerError, 500);
      }
      const { viewerActorId } = viewer;
      const [owner, items] = await Promise.all([
        statusAssembler.assembleAccounts({ actorIds: [id.val], requestUrl: c.req.url }),
        isTrue(c.req.query('pinned')) || (c.req.query('tagged') ?? '').length > 0
          ? { ok: true as const, val: [] }
          : accountStatusItemsResolverByActorId.resolve({
            actorId: id.val,
            currentActorId: viewerActorId,
            page,
            excludeReplies: isTrue(c.req.query('exclude_replies')),
            excludeReblogs: isTrue(c.req.query('exclude_reblogs')),
            onlyMedia: isTrue(c.req.query('only_media')),
          }),
      ]);
      if (owner[0] === undefined) {
        return c.json(recordNotFound, 404);
      }
      if (viewerActorId === undefined && isRemoteAccount(owner[0])) {
        return c.json([]);
      }
      if (!items.ok) {
        return c.json(internalServerError, 500);
      }
      const rows = toNewestFirst(items.val, page);
      const statuses = await statusAssembler.assemble({
        sources: viewerActorId === undefined ? rows.filter((row) => !isRemoteSource(row)) : rows,
        viewerActorId,
        requestUrl: c.req.url,
      });
      return respondWithPage(c, statuses, rows.map(statusSourceId));
    })
    .get('/v1/accounts/:id/followers', authn.optionalAuth, listAccounts(actorIdsResolverByFollowingId))
    .get('/v1/accounts/:id/following', authn.optionalAuth, listAccounts(actorIdsResolverByFollowerId));
};
