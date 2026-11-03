import { Hono } from 'hono';

import type {
  ActorIdsResolverByFollowerIdWithPagination,
  ActorIdsResolverByFollowingIdWithPagination,
} from '../../domain/actor/accountProfile.ts';
import { ActorId } from '../../domain/actor/actorId.ts';
import type { PageRequest } from '../../domain/page/page.ts';
import type { Account } from '../mastodon/entities.ts';
import type { StatusAssembler } from '../mastodon/statusAssembler.ts';
import { accountListLimits, parsePageRequest, respondWithPage, toNewestFirst } from './helper/mastodonPage.ts';
import type { MastodonAuthEnv, MastodonAuthn } from './mastodonAuthn.ts';

export type WorkerMastodonAccountsRouterDeps = Readonly<{
  authn: MastodonAuthn;
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

export const createWorkerMastodonAccountsRouter = ({
  authn,
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

  return new Hono<MastodonAuthEnv>()
    .get('/v1/accounts/:id/followers', authn.optionalAuth, listAccounts(actorIdsResolverByFollowingId))
    .get('/v1/accounts/:id/following', authn.optionalAuth, listAccounts(actorIdsResolverByFollowerId));
};
