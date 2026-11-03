import { Hono } from 'hono';

import type { AccountStatsResolverByActorId } from '../../domain/actor/accountStats.ts';
import type { ActorResolverByUserId } from '../../domain/actor/actor.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import type { User, UserResolver, UserResolverByUsername } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { defaultImageUrls } from '../mastodon/defaultImages.ts';
import type { Account, CredentialAccount, Marker, Preferences } from '../mastodon/entities.ts';
import { buildInstanceV1, buildInstanceV2 } from '../mastodon/instance.ts';
import { IORI_VERSION } from '../mastodon/ioriVersion.ts';
import { toIsoString } from '../mastodon/time.ts';
import { toAccount } from '../mastodon/toAccount.ts';
import { actorNotFound, handleInternalError, internalServerError } from './helper/mastodonErrors.ts';
import { readRequestBody, type RequestBody } from './helper/requestBody.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';

export type WorkerMastodonCoreRouterDeps = Readonly<{
  authn: MastodonAuthn;
  userResolver: UserResolver;
  userResolverByUsername: UserResolverByUsername;
  actorResolverByUserId: ActorResolverByUserId;
  accountStatsResolver: AccountStatsResolverByActorId;
  instance: Readonly<{
    domain: string;
    title: string;
    description: string;
    contactUsername: Username;
    vapidPublicKey: string | undefined;
  }>;
}>;

const invalidToken = { error: 'The access token is invalid' } as const;
const recordNotFound = { error: 'Record not found' } as const;

type AccountLookup =
  | Readonly<{ kind: 'ok'; account: CredentialAccount }>
  | Readonly<{ kind: 'noActor' }>
  | Readonly<{ kind: 'failed' }>;

const scope = (value: string): Scope => Scope.orThrow(value);
const readScope = scope('read');
const readAccounts = scope('read:accounts');
const readBookmarks = scope('read:bookmarks');
const readBlocks = scope('read:blocks');
const readFilters = scope('read:filters');
const readFollows = scope('read:follows');
const readLists = scope('read:lists');
const readSearch = scope('read:search');
const readStatuses = scope('read:statuses');
const writeStatuses = scope('write:statuses');
const profileScope = scope('profile');
const pushScope = scope('push');

const preferences: Preferences = {
  'posting:default:visibility': 'public',
  'posting:default:sensitive': false,
  'posting:default:language': null,
  'reading:expand:media': 'default',
  'reading:expand:spoilers': false,
};

const languages = [{ code: 'ja', name: 'Japanese' }, { code: 'en', name: 'English' }] as const;

const markerKeys = ['home', 'notifications'] as const;

const readLastReadId = (body: RequestBody, key: string): string | undefined => {
  const nested = body[key];
  if (typeof nested === 'object' && nested !== null && !Array.isArray(nested)) {
    const lastReadId = Reflect.get(nested, 'last_read_id');
    return typeof lastReadId === 'string' ? lastReadId : undefined;
  }
  const flat = body[`${key}[last_read_id]`];
  return typeof flat === 'string' ? flat : undefined;
};

export const createWorkerMastodonCoreRouter = ({
  authn,
  userResolver,
  userResolverByUsername,
  actorResolverByUserId,
  accountStatsResolver,
  instance,
}: WorkerMastodonCoreRouterDeps): Hono<MastodonAuthEnv> => {
  const resolveAccount = async (user: User, requestUrl: string): Promise<AccountLookup> => {
    const actor = await actorResolverByUserId.resolve(user.id);
    if (!actor.ok) {
      return { kind: 'failed' };
    }
    if (actor.val === undefined) {
      return { kind: 'noActor' };
    }
    const stats = await accountStatsResolver.resolve(actor.val.id);
    if (!stats.ok) {
      return { kind: 'failed' };
    }
    const account: Account = toAccount({ type: 'local', user, actor: actor.val }, {
      ...defaultImageUrls(requestUrl),
      baseUrl: requestUrl,
      ...stats.val,
    });
    return {
      kind: 'ok',
      account: {
        ...account,
        source: {
          privacy: 'public',
          sensitive: false,
          language: null,
          note: '',
          fields: [],
          discoverable: null,
          indexable: false,
          follow_requests_count: 0,
        },
      },
    };
  };

  const resolveContactAccount = async (requestUrl: string): Promise<Account | null> => {
    const user = await userResolverByUsername.resolve(instance.contactUsername);
    if (!user.ok || user.val === undefined) {
      return null;
    }
    const lookup = await resolveAccount(user.val, requestUrl);
    return lookup.kind === 'ok' ? lookup.account : null;
  };

  const instanceProps = async (requestUrl: string) => ({
    domain: instance.domain,
    title: instance.title,
    description: instance.description,
    ioriVersion: IORI_VERSION,
    contactAccount: await resolveContactAccount(requestUrl),
    vapidPublicKey: instance.vapidPublicKey ?? null,
  });

  const app = new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .get('/v1/accounts/verify_credentials', authn.requireUser(readAccounts, profileScope), async (c) => {
      const userId = getMastodonPrincipal(c)?.userId;
      if (userId === null || userId === undefined) {
        return c.json(invalidToken, 401);
      }
      const user = await userResolver.resolve(userId);
      if (!user.ok) {
        return c.json(internalServerError, 500);
      }
      if (user.val === undefined) {
        return c.json(invalidToken, 401);
      }
      const lookup = await resolveAccount(user.val, c.req.url);
      if (lookup.kind === 'failed') {
        return c.json(internalServerError, 500);
      }
      return lookup.kind === 'noActor' ? c.json(actorNotFound, 422) : c.json(lookup.account);
    })
    .get('/v1/instance', async (c) => c.json(buildInstanceV1(await instanceProps(c.req.url))))
    .get('/v2/instance', async (c) => c.json(buildInstanceV2(await instanceProps(c.req.url))))
    .get('/v1/custom_emojis', (c) => c.json([]))
    .get('/v1/accounts/:id/featured_tags', (c) => c.json([]))
    .get('/v1/accounts/:id/endorsements', authn.optionalAuth, (c) => c.json([]))
    .get('/v1/accounts/familiar_followers', authn.requireUser(readFollows), (c) => {
      const ids = [...(c.req.queries('id[]') ?? []), ...(c.req.queries('id') ?? [])];
      return c.json(ids.map((id) => ({ id, accounts: [] })));
    })
    .get('/v1/instance/translation_languages', (c) => c.json({}))
    .get('/v1/instance/languages', (c) => c.json(languages))
    .get('/v1/trends/statuses', (c) => c.json([]))
    .get('/v1/trends/tags', (c) => c.json([]))
    .get('/v1/trends/links', (c) => c.json([]))
    .get('/v1/preferences', authn.requireUser(readAccounts), (c) => c.json(preferences))
    .get('/v1/markers', authn.requireUser(readStatuses), (c) => c.json({}))
    .post('/v1/markers', authn.requireUser(writeStatuses), async (c) => {
      const body = await readRequestBody(c);
      const updatedAt = toIsoString(Instant.now());
      const markers: Partial<Record<(typeof markerKeys)[number], Marker>> = {};
      for (const key of markerKeys) {
        const lastReadId = readLastReadId(body, key);
        if (lastReadId !== undefined) {
          markers[key] = { last_read_id: lastReadId, version: 0, updated_at: updatedAt };
        }
      }
      return c.json(markers);
    })
    .get('/v1/push/subscription', authn.requireUser(pushScope), (c) => c.json(recordNotFound, 404))
    .get('/v2/search', authn.requireUser(readSearch), (c) => c.json({ accounts: [], statuses: [], hashtags: [] }));

  const emptyLists: ReadonlyArray<readonly [string, Scope]> = [
    ['/v1/filters', readFilters],
    ['/v2/filters', readFilters],
    ['/v1/lists', readLists],
    ['/v1/announcements', readScope],
    ['/v1/followed_tags', readFollows],
    ['/v1/follow_requests', readFollows],
    ['/v1/bookmarks', readBookmarks],
    ['/v1/blocks', readBlocks],
    ['/v1/domain_blocks', readBlocks],
    ['/v1/featured_tags', readAccounts],
    ['/v1/conversations', readStatuses],
    ['/v1/scheduled_statuses', readStatuses],
  ];
  for (const [path, requiredScope] of emptyLists) {
    app.get(path, authn.requireUser(requiredScope), (c) => c.json([]));
  }
  return app;
};
