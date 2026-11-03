import { Hono } from 'hono';

import type {
  ActorIdsResolverByFollowerIdWithPagination,
  ActorIdsResolverByFollowingIdWithPagination,
} from '../../domain/actor/accountProfile.ts';
import type {
  AccountRelationshipsResolverByActorIds,
  AcctLookup,
  ActorIdResolverByAcct,
} from '../../domain/actor/accountRelationship.ts';
import type { ActorResolverByUserId } from '../../domain/actor/actor.ts';
import { ActorId } from '../../domain/actor/actorId.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import type { PageRequest } from '../../domain/page/page.ts';
import type { AccountStatusItemsResolverByActorId } from '../../domain/post/accountStatusItem.ts';
import { Username } from '../../domain/user/username.ts';
import type { ActorResolverById } from '../d1/actor/actorResolverById.ts';
import type { Account } from '../mastodon/entities.ts';
import { isSourceVisibleToAnonymous, type StatusAssembler, statusSourceId } from '../mastodon/statusAssembler.ts';
import { toRelationship } from '../mastodon/toRelationship.ts';
import { actorNotFound, handleInternalError, internalServerError } from './helper/mastodonErrors.ts';
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
  actorIdResolverByAcct: ActorIdResolverByAcct;
  accountRelationshipsResolverByActorIds: AccountRelationshipsResolverByActorIds;
  statusAssembler: StatusAssembler;
}>;

type ActorIdsPageResolver = Readonly<{
  resolve: (input: Readonly<{ actorId: ActorId; page: PageRequest }>) => PromiseLike<
    Readonly<{ ok: boolean; val?: ReadonlyArray<ActorId> }>
  >;
}>;

const invalidToken = { error: 'The access token is invalid' } as const;
const recordNotFound = { error: 'Record not found' } as const;
const readAccounts = Scope.orThrow('read:accounts');
const readFollows = Scope.orThrow('read:follows');
const readStatuses = Scope.orThrow('read:statuses');

const parseAcct = (acct: string, localHost: string): AcctLookup | undefined => {
  const [username, host, ...rest] = (acct.startsWith('@') ? acct.slice(1) : acct).split('@');
  if (username === undefined || username.length === 0 || rest.length > 0 || host === '') {
    return undefined;
  }
  if (host === undefined || host.toLowerCase() === localHost.toLowerCase()) {
    const parsed = Username.parse(username);
    return parsed.ok ? { type: 'local', username: parsed.val } : undefined;
  }
  return { type: 'remote', username, host: host.toLowerCase() };
};

const accountIdPattern = '[0-9a-fA-F-]+';

export const createWorkerMastodonAccountsRouter = ({
  authn,
  actorResolverByUserId,
  actorResolverById,
  accountStatusItemsResolverByActorId,
  actorIdsResolverByFollowerId,
  actorIdsResolverByFollowingId,
  actorIdResolverByAcct,
  accountRelationshipsResolverByActorIds,
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
    .get('/v1/accounts/lookup', authn.optionalAuth, async (c) => {
      const rejection = rejectUnlessTokenScope(c, getMastodonPrincipal(c), [readAccounts]);
      if (rejection !== undefined) {
        return rejection;
      }
      const lookup = parseAcct(c.req.query('acct') ?? '', new URL(c.req.url).host);
      if (lookup === undefined) {
        return c.json(recordNotFound, 404);
      }
      const actorId = await actorIdResolverByAcct.resolve(lookup);
      if (!actorId.ok) {
        return c.json(internalServerError, 500);
      }
      if (actorId.val === undefined) {
        return c.json(recordNotFound, 404);
      }
      const [account] = await statusAssembler.assembleAccounts({ actorIds: [actorId.val], requestUrl: c.req.url });
      return account === undefined ? c.json(recordNotFound, 404) : c.json(account);
    })
    .get('/v1/accounts/relationships', authn.requireUser(readFollows), async (c) => {
      const userId = getMastodonPrincipal(c)?.userId;
      if (userId === null || userId === undefined) {
        return c.json(invalidToken, 401);
      }
      const viewer = await actorResolverByUserId.resolve(userId);
      if (!viewer.ok) {
        return c.json(internalServerError, 500);
      }
      if (viewer.val === undefined) {
        return c.json(actorNotFound, 422);
      }
      const ids = [...(c.req.queries('id[]') ?? []), ...(c.req.queries('id') ?? [])];
      const actorIds = [...new Set(ids)].flatMap((id) => {
        const parsed = ActorId.parse(id);
        return parsed.ok ? [parsed.val] : [];
      });
      const relationships = await accountRelationshipsResolverByActorIds.resolve({
        viewerActorId: viewer.val.id,
        viewerUserId: userId,
        actorIds,
      });
      if (!relationships.ok) {
        return c.json(internalServerError, 500);
      }
      const byActorId = new Map(relationships.val.map((relationship) => [relationship.actorId, relationship]));
      return c.json(actorIds.flatMap((actorId) => {
        const relationship = byActorId.get(actorId);
        return relationship === undefined
          ? []
          : [toRelationship({
            id: actorId,
            following: relationship.following,
            followedBy: relationship.followedBy,
            muting: relationship.muting,
          })];
      }));
    })
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
            onlyVisibleToViewer: true,
          }),
      ]);
      if (owner[0] === undefined) {
        return c.json(recordNotFound, 404);
      }
      if (!items.ok) {
        return c.json(internalServerError, 500);
      }
      const rows = toNewestFirst(items.val, page);
      const statuses = await statusAssembler.assemble({
        sources: viewerActorId === undefined ? rows.filter(isSourceVisibleToAnonymous) : rows,
        viewerActorId,
        requestUrl: c.req.url,
      });
      return respondWithPage(c, statuses, rows.map(statusSourceId));
    })
    .get('/v1/accounts/:id/followers', authn.optionalAuth, listAccounts(actorIdsResolverByFollowingId))
    .get('/v1/accounts/:id/following', authn.optionalAuth, listAccounts(actorIdsResolverByFollowerId));
};
