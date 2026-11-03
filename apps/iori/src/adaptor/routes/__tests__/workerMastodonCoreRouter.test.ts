import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createIoriApp } from '../../../appFactory.tsx';
import type { LocalActor } from '../../../domain/actor/actor.ts';
import { ActorId } from '../../../domain/actor/actorId.ts';
import type { Instant } from '../../../domain/instant/instant.ts';
import type { User } from '../../../domain/user/user.ts';
import { Username } from '../../../domain/user/username.ts';
import { CredentialAccountSchema, InstanceV1Schema, InstanceV2Schema } from '../../mastodon/entities.ts';
import { createMastodonAuthn } from '../mastodonAuthn.ts';
import { createWorkerMastodonCoreRouter } from '../workerMastodonCoreRouter.ts';
import { createWorkerMastodonFallbackRouter } from '../workerMastodonFallbackRouter.ts';
import { createOAuthHarness, ORIGIN } from './helper/oauthHarness.ts';

const setup = ({ failUserResolve = false }: { failUserResolve?: boolean } = {}) => {
  const h = createOAuthHarness();
  const authn = createMastodonAuthn({
    verifyAccessTokenUseCase: h.memory.useCases.verifyAccessTokenUseCase,
    sessionResolver: h.memory.sessionResolver as never,
  });
  const actorId = ActorId.generate();
  const users = new Map<string, User>();
  const actors = new Map<string, LocalActor>();
  const addUser = (userId: string, username: string) => {
    const user = { id: userId, username: Username.orThrow(username) } as User;
    users.set(userId, user);
    actors.set(userId, {
      id: actorId,
      uri: `${ORIGIN}/users/${username}`,
      inboxUrl: `${ORIGIN}/users/${username}/inbox`,
      type: 'local',
      userId,
      logoUri: undefined,
    } as LocalActor);
  };
  const router = createWorkerMastodonCoreRouter({
    authn,
    userResolver: {
      resolve: (userId: string) => {
        if (failUserResolve) {
          throw new Error('boom');
        }
        return RA.ok(users.get(userId));
      },
    } as never,
    userResolverByUsername: {
      resolve: (username: string) => RA.ok([...users.values()].find((user) => user.username === username)),
    } as never,
    actorResolverByUserId: { resolve: (userId: string) => RA.ok(actors.get(userId)) } as never,
    accountStatsResolver: {
      resolve: () =>
        RA.ok({
          followersCount: 3,
          followingCount: 2,
          statusesCount: 5,
          createdAt: Date.UTC(2025, 0, 2, 3, 4, 5) as Instant,
          lastStatusAt: Date.UTC(2025, 5, 6) as Instant,
        }),
    } as never,
    instance: {
      domain: 'iori.test',
      title: 'iori.test',
      description: 'A microblog by kosui',
      contactUsername: Username.orThrow('kosui'),
      vapidPublicKey: 'vapid-key',
    },
  });
  const app = createIoriApp({
    federationMiddleware: undefined,
    registerRoutes: (root) => {
      root.route('/api', router);
      root.route('/api', createWorkerMastodonFallbackRouter());
    },
    serveAsset: async () => undefined,
    serveUpload: async () => undefined,
    serveOgImage: async () => new Response('og', { status: 200 }),
  });
  const request = (path: string, init?: RequestInit) => app.request(`${ORIGIN}${path}`, init);
  return { ...h, addUser, request, app };
};

describe('createWorkerMastodonCoreRouter', () => {
  describe('GET /api/v1/accounts/verify_credentials', () => {
    it('Bearer で CredentialAccount を返し、件数を D1 の集計から入れる', async () => {
      const h = setup();
      const { token, userId } = await h.issueUserToken('read:accounts');
      h.addUser(userId, 'kosui');

      const response = await h.request('/api/v1/accounts/verify_credentials', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(200);
      const body = CredentialAccountSchema.parse(await response.json());
      expect(body).toMatchObject({
        username: 'kosui',
        acct: 'kosui',
        followers_count: 3,
        following_count: 2,
        statuses_count: 5,
        created_at: '2025-01-02T03:04:05.000Z',
        last_status_at: '2025-06-06',
        avatar: `${ORIGIN}/default-avatar.png`,
        header: `${ORIGIN}/default-header.png`,
        indexable: false,
        hide_collections: null,
        source: {
          privacy: 'public',
          sensitive: false,
          language: null,
          note: '',
          fields: [],
          discoverable: null,
          indexable: false,
        },
      });
    });

    it('Cookie でも通る', async () => {
      const h = setup();
      const { sessionId, userId } = h.memory.addSession();
      h.addUser(userId, 'kosui');

      const response = await h.request('/api/v1/accounts/verify_credentials', {
        headers: { Cookie: `sessionId=${sessionId}` },
      });

      expect(response.status).toBe(200);
      expect(CredentialAccountSchema.parse(await response.json()).username).toBe('kosui');
    });

    it('profile スコープだけでも通る', async () => {
      const h = setup();
      const { token, userId } = await h.issueUserToken('profile');
      h.addUser(userId, 'kosui');

      const response = await h.request('/api/v1/accounts/verify_credentials', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(200);
    });

    it('スコープが足りなければ 403 にする', async () => {
      const h = setup();
      const { token, userId } = await h.issueUserToken('read:statuses');
      h.addUser(userId, 'kosui');

      const response = await h.request('/api/v1/accounts/verify_credentials', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'This action is outside the authorized scopes' });
    });

    it('例外が起きたら JSON の 500 を返す', async () => {
      const h = setup({ failUserResolve: true });
      const { token, userId } = await h.issueUserToken('read:accounts');
      h.addUser(userId, 'kosui');

      const response = await h.request('/api/v1/accounts/verify_credentials', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(500);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(await response.json()).toEqual({ error: 'Internal server error' });
    });

    it('認証がなければ 401 にする', async () => {
      const h = setup();

      const response = await h.request('/api/v1/accounts/verify_credentials');

      expect(response.status).toBe(401);
    });

    it('アプリのトークンだけでは 401 にする', async () => {
      const h = setup();
      const { token } = await h.issueAppToken('read');

      const response = await h.request('/api/v1/accounts/verify_credentials', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(401);
    });
  });

  describe('instance', () => {
    it('v1 と v2 を認証なしで返し、スキーマで parse できる', async () => {
      const h = setup();
      h.addUser(crypto.randomUUID(), 'kosui');

      const [v1, v2] = await Promise.all([h.request('/api/v1/instance'), h.request('/api/v2/instance')]);

      expect(v1.status).toBe(200);
      expect(v2.status).toBe(200);
      const v1Body = InstanceV1Schema.parse(await v1.json());
      const v2Body = InstanceV2Schema.parse(await v2.json());
      expect(v1Body).toMatchObject({
        uri: 'iori.test',
        title: 'iori.test',
        description: 'A microblog by kosui',
        contact_account: { username: 'kosui' },
        configuration: { vapid: { public_key: 'vapid-key' } },
      });
      expect(v2Body).toMatchObject({
        domain: 'iori.test',
        contact: { account: { username: 'kosui' } },
        configuration: { vapid: { public_key: 'vapid-key' } },
      });
    });

    it('連絡先の利用者がいなければ contact_account を null にする', async () => {
      const h = setup();

      const response = await h.request('/api/v1/instance');

      expect(InstanceV1Schema.parse(await response.json()).contact_account).toBeNull();
    });
  });

  describe('空の応答', () => {
    const emptyArrays: ReadonlyArray<readonly [string, string | undefined]> = [
      ['/api/v1/custom_emojis', undefined],
      ['/api/v1/accounts/abc/featured_tags', undefined],
      ['/api/v1/accounts/abc/endorsements', undefined],
      ['/api/v1/trends/statuses', undefined],
      ['/api/v1/trends/tags', undefined],
      ['/api/v1/trends/links', undefined],
      ['/api/v1/filters', 'read:filters'],
      ['/api/v2/filters', 'read:filters'],
      ['/api/v1/lists', 'read:lists'],
      ['/api/v1/announcements', 'read'],
      ['/api/v1/followed_tags', 'read:follows'],
      ['/api/v1/follow_requests', 'read:follows'],
      ['/api/v1/bookmarks', 'read:bookmarks'],
      ['/api/v1/blocks', 'read:blocks'],
      ['/api/v1/domain_blocks', 'read:blocks'],
      ['/api/v1/featured_tags', 'read:accounts'],
      ['/api/v1/conversations', 'read:statuses'],
      ['/api/v1/scheduled_statuses', 'read:statuses'],
    ];

    it.each(emptyArrays)('%s は [] を返す', async (path, scope) => {
      const h = setup();
      const headers: Record<string, string> = {};
      if (scope !== undefined) {
        headers['Authorization'] = `Bearer ${(await h.issueUserToken(scope)).token}`;
      }

      const response = await h.request(path, { headers });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
    });

    it.each(emptyArrays.filter(([, scope]) => scope !== undefined))(
      '%s は認証がなければ 401、スコープが違えば 403 にする',
      async (path, scope) => {
        const h = setup();
        const otherScope = scope === 'read:statuses' ? 'read:lists' : 'read:statuses';
        const { token } = await h.issueUserToken(scope === 'read' ? 'follow' : otherScope);

        const anonymous = await h.request(path);
        const denied = await h.request(path, { headers: { Authorization: `Bearer ${token}` } });

        expect(anonymous.status).toBe(401);
        expect(denied.status).toBe(403);
      },
    );

    it('instance/languages は日本語と英語を認証なしで返す', async () => {
      const response = await setup().request('/api/v1/instance/languages');

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([{ code: 'ja', name: 'Japanese' }, { code: 'en', name: 'English' }]);
    });

    it('instance/translation_languages は空のオブジェクトを認証なしで返す', async () => {
      const response = await setup().request('/api/v1/instance/translation_languages');

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({});
    });

    it('familiar_followers は id[] と id ごとに空の accounts を返す', async () => {
      const h = setup();
      const { token } = await h.issueUserToken('read:follows');

      const response = await h.request('/api/v1/accounts/familiar_followers?id[]=a&id[]=b&id=c', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([
        { id: 'a', accounts: [] },
        { id: 'b', accounts: [] },
        { id: 'c', accounts: [] },
      ]);
    });

    it('familiar_followers は認証がなければ 401、スコープが違えば 403 にする', async () => {
      const h = setup();
      const { token } = await h.issueUserToken('read:statuses');

      const anonymous = await h.request('/api/v1/accounts/familiar_followers?id[]=a');
      const denied = await h.request('/api/v1/accounts/familiar_followers?id[]=a', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(anonymous.status).toBe(401);
      expect(denied.status).toBe(403);
    });

    it('preferences を返す', async () => {
      const h = setup();
      const { token } = await h.issueUserToken('read:accounts');

      const response = await h.request('/api/v1/preferences', { headers: { Authorization: `Bearer ${token}` } });

      expect(await response.json()).toEqual({
        'posting:default:visibility': 'public',
        'posting:default:sensitive': false,
        'posting:default:language': null,
        'reading:expand:media': 'default',
        'reading:expand:spoilers': false,
      });
    });

    it('push の購読がなければ 404 を返す', async () => {
      const h = setup();
      const { token } = await h.issueUserToken('push');

      const response = await h.request('/api/v1/push/subscription', { headers: { Authorization: `Bearer ${token}` } });

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Record not found' });
    });
  });

  describe('未実装のパスの受け皿', () => {
    it('/api/v1 と /api/v2 の未実装のパスに 404 を返し、認証付きの要求だけメソッドとパスをログに出す', async () => {
      const h = setup();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { token, sessionId } = { ...(await h.issueUserToken('read')), ...h.memory.addSession() };

      const responses = await Promise.all([
        h.request('/api/v1/statuses/abc?secret=1', { headers: { Authorization: `Bearer ${token}` } }),
        h.request('/api/v2/unknown', { method: 'POST', headers: { Cookie: `sessionId=${sessionId}` } }),
      ]);

      expect(responses.map((response) => response.status)).toEqual([404, 404]);
      expect(await responses[0]!.json()).toEqual({ error: 'Record not found' });
      const logged = warn.mock.calls.map((call) => String(call[0]));
      expect(logged).toContain('Unimplemented Mastodon API: GET /api/v1/statuses/abc');
      expect(logged).toContain('Unimplemented Mastodon API: POST /api/v2/unknown');
      expect(logged.join('\n')).not.toContain('secret');
      warn.mockRestore();
    });

    it('Authorization も Cookie の sessionId もない要求は 404 を返し、ログに出さない', async () => {
      const h = setup();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const responses = await Promise.all([
        h.request('/api/v1/statuses/abc'),
        h.request('/api/v2/unknown', { method: 'POST' }),
      ]);

      expect(responses.map((response) => response.status)).toEqual([404, 404]);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('/api/v1 と /api/v2 の外には影響しない', async () => {
      const h = setup();

      const [og, other] = await Promise.all([h.request('/api/og/articles/x'), h.request('/api/other')]);

      expect(og.status).toBe(200);
      expect(other.status).toBe(404);
      expect(await other.text()).toBe('404 Not Found');
    });
  });
});
