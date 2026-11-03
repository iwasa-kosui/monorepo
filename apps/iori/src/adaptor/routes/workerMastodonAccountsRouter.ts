import type { Context as FedifyContext } from '@fedify/fedify';
import { type Context, Hono } from 'hono';

import type {
  ActorIdsResolverByFollowerIdWithPagination,
  ActorIdsResolverByFollowingIdWithPagination,
} from '../../domain/actor/accountProfile.ts';
import type {
  AccountRelationship,
  AccountRelationshipsResolverByActorIds,
  AcctLookup,
  ActorIdResolverByAcct,
} from '../../domain/actor/accountRelationship.ts';
import type { Actor, ActorResolverByUserId } from '../../domain/actor/actor.ts';
import { ActorId } from '../../domain/actor/actorId.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import type { PageRequest } from '../../domain/page/page.ts';
import type { AccountStatusItemsResolverByActorId } from '../../domain/post/accountStatusItem.ts';
import type { UserId } from '../../domain/user/userId.ts';
import { Username } from '../../domain/user/username.ts';
import type { WorkerRemoteActorAction } from '../../runtime/ports.ts';
import type { CreateMuteUseCase } from '../../useCase/createMute.ts';
import type { DeleteMuteUseCase } from '../../useCase/deleteMute.ts';
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
  createMuteUseCase: CreateMuteUseCase;
  deleteMuteUseCase: DeleteMuteUseCase;
  followRemoteActor: WorkerRemoteActorAction;
  unfollowRemoteActor: WorkerRemoteActorAction;
  createContext: (request: Request) => FedifyContext<unknown>;
}>;

type AccountAction = (
  input: Readonly<{ userId: UserId; viewerActorId: ActorId; target: Actor; request: Request }>,
) => Promise<string | undefined>;

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
const writeFollows = Scope.orThrow('write:follows');
const writeMutes = Scope.orThrow('write:mutes');
const ownAccount = { error: 'Validation failed: The action cannot target your own account' } as const;
const localTargetError = 'Validation failed: The action is not supported for local accounts';

const relationshipOf = (relationship: AccountRelationship) =>
  toRelationship({
    id: relationship.actorId,
    following: relationship.following,
    followedBy: relationship.followedBy,
    muting: relationship.muting,
  });

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
  createMuteUseCase,
  deleteMuteUseCase,
  followRemoteActor,
  unfollowRemoteActor,
  createContext,
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

  const resolveRelationship = async (
    viewerActorId: ActorId,
    userId: UserId,
    actorId: ActorId,
  ): Promise<AccountRelationship | undefined> => {
    const relationships = await accountRelationshipsResolverByActorIds.resolve({
      viewerActorId,
      viewerUserId: userId,
      actorIds: [actorId],
    });
    if (!relationships.ok) {
      throw new Error('Failed to resolve the relationship');
    }
    return relationships.val[0];
  };

  const actOnAccount = (action: AccountAction) => async (c: Context<MastodonAuthEnv>) => {
    const userId = getMastodonPrincipal(c)?.userId;
    if (userId === null || userId === undefined) {
      return c.json(invalidToken, 401);
    }
    const id = ActorId.parse(c.req.param('id'));
    if (!id.ok) {
      return c.json(recordNotFound, 404);
    }
    const [viewer, target] = await Promise.all([
      actorResolverByUserId.resolve(userId),
      actorResolverById.resolve(id.val),
    ]);
    if (!viewer.ok || !target.ok) {
      return c.json(internalServerError, 500);
    }
    if (viewer.val === undefined) {
      return c.json(actorNotFound, 422);
    }
    if (target.val === undefined) {
      return c.json(recordNotFound, 404);
    }
    if (target.val.id === viewer.val.id) {
      return c.json(ownAccount, 422);
    }
    const viewerActorId = viewer.val.id;
    const rejection = await action({ userId, viewerActorId, target: target.val, request: c.req.raw });
    if (rejection !== undefined) {
      return c.json({ error: rejection }, 422);
    }
    const relationship = await resolveRelationship(viewerActorId, userId, target.val.id);
    return relationship === undefined ? c.json(recordNotFound, 404) : c.json(relationshipOf(relationship));
  };

  const follow: AccountAction = async ({ userId, viewerActorId, target, request }) => {
    if (target.type !== 'remote') {
      return localTargetError;
    }
    if ((await resolveRelationship(viewerActorId, userId, target.id))?.following === true) {
      return undefined;
    }
    const followed = await followRemoteActor({ userId, actorId: target.id, ctx: createContext(request) });
    return followed.ok ? undefined : followed.err.message;
  };

  const unfollow: AccountAction = async ({ userId, viewerActorId, target, request }) => {
    if (target.type !== 'remote') {
      return localTargetError;
    }
    if ((await resolveRelationship(viewerActorId, userId, target.id))?.following !== true) {
      return undefined;
    }
    const unfollowed = await unfollowRemoteActor({ userId, actorId: target.id, ctx: createContext(request) });
    return unfollowed.ok ? undefined : unfollowed.err.message;
  };

  const mute: AccountAction = async ({ userId, target }) => {
    const muted = await createMuteUseCase.run({ userId, mutedActorId: target.id });
    return !muted.ok && muted.err.type !== 'AlreadyMutedError' ? muted.err.message : undefined;
  };

  const unmute: AccountAction = async ({ userId, target }) => {
    const unmuted = await deleteMuteUseCase.run({ userId, mutedActorId: target.id });
    return !unmuted.ok && unmuted.err.type !== 'NotMutedError' ? unmuted.err.message : undefined;
  };

  return new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .post(`/v1/accounts/:id{${accountIdPattern}}/follow`, authn.requireUser(writeFollows), actOnAccount(follow))
    .post(`/v1/accounts/:id{${accountIdPattern}}/unfollow`, authn.requireUser(writeFollows), actOnAccount(unfollow))
    .post(`/v1/accounts/:id{${accountIdPattern}}/mute`, authn.requireUser(writeMutes), actOnAccount(mute))
    .post(`/v1/accounts/:id{${accountIdPattern}}/unmute`, authn.requireUser(writeMutes), actOnAccount(unmute))
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
        return relationship === undefined ? [] : [relationshipOf(relationship)];
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
