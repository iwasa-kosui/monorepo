import { Hono } from 'hono';

import type {
  ActorIdsResolverByFollowerIdWithPagination,
  ActorIdsResolverByFollowingIdWithPagination,
} from '../../domain/actor/accountProfile.ts';
import type { ActorResolverByUserId } from '../../domain/actor/actor.ts';
import { ActorId } from '../../domain/actor/actorId.ts';
import type { PageRequest } from '../../domain/page/page.ts';
import type { AccountStatusItemsResolverByActorId } from '../../domain/post/accountStatusItem.ts';
import type { UserId } from '../../domain/user/userId.ts';
import type { Account } from '../mastodon/entities.ts';
import type { StatusAssembler } from '../mastodon/statusAssembler.ts';
import {
  accountListLimits,
  isTrue,
  parsePageRequest,
  respondWithPage,
  timelineLimits,
  toNewestFirst,
} from './helper/mastodonPage.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';

export type WorkerMastodonAccountsRouterDeps = Readonly<{
  authn: MastodonAuthn;
  actorResolverByUserId: ActorResolverByUserId;
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

const accountIdPattern = '[0-9a-fA-F-]+';

export const createWorkerMastodonAccountsRouter = ({
  authn,
  actorResolverByUserId,
  accountStatusItemsResolverByActorId,
  actorIdsResolverByFollowerId,
  actorIdsResolverByFollowingId,
  statusAssembler,
}: WorkerMastodonAccountsRouterDeps): Hono<MastodonAuthEnv> => {
  const listAccounts = (resolver: ActorIdsPageResolver) => async (c: Parameters<typeof respondWithPage>[0]) => {
    const id = ActorId.parse(c.req.param('id'));
    if (!id.ok) {
      return c.json(recordNotFound, 404);
    }
    const page = parsePageRequest(c, accountListLimits);
    const [owner, related] = await Promise.all([
      statusAssembler.assembleAccounts({ actorIds: [id.val], requestUrl: c.req.url }),
      resolver.resolve({ actorId: id.val, page }),
    ]);
    if (owner.length === 0) {
      return c.json(recordNotFound, 404);
    }
    const actorIds = related.ok ? related.val ?? [] : [];
    const accounts: Account[] = await statusAssembler.assembleAccounts({
      actorIds: toNewestFirst(actorIds, page),
      requestUrl: c.req.url,
    });
    return respondWithPage(c, accounts, (account) => account.id);
  };

  const resolveViewerActorId = async (userId: UserId | null | undefined): Promise<ActorId | undefined> => {
    if (userId === null || userId === undefined) {
      return undefined;
    }
    const actor = await actorResolverByUserId.resolve(userId);
    return actor.ok ? actor.val?.id : undefined;
  };

  return new Hono<MastodonAuthEnv>()
    .get(`/v1/accounts/:id{${accountIdPattern}}`, authn.optionalAuth, async (c) => {
      const id = ActorId.parse(c.req.param('id'));
      if (!id.ok) {
        return c.json(recordNotFound, 404);
      }
      const [account] = await statusAssembler.assembleAccounts({ actorIds: [id.val], requestUrl: c.req.url });
      return account === undefined ? c.json(recordNotFound, 404) : c.json(account);
    })
    .get(`/v1/accounts/:id{${accountIdPattern}}/statuses`, authn.optionalAuth, async (c) => {
      const id = ActorId.parse(c.req.param('id'));
      if (!id.ok) {
        return c.json(recordNotFound, 404);
      }
      const page = parsePageRequest(c, timelineLimits);
      const viewerActorId = await resolveViewerActorId(getMastodonPrincipal(c)?.userId);
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
      if (owner.length === 0) {
        return c.json(recordNotFound, 404);
      }
      const statuses = await statusAssembler.assemble({
        sources: items.ok ? toNewestFirst(items.val, page) : [],
        viewerActorId,
        requestUrl: c.req.url,
      });
      return respondWithPage(c, statuses, (status) => status.id);
    })
    .get('/v1/accounts/:id/followers', authn.optionalAuth, listAccounts(actorIdsResolverByFollowingId))
    .get('/v1/accounts/:id/following', authn.optionalAuth, listAccounts(actorIdsResolverByFollowerId));
};
