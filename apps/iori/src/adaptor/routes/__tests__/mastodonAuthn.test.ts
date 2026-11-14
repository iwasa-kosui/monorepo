import { describe, expect, it } from 'vitest';

import { createOAuthHarness, ORIGIN } from './helper/oauthHarness.ts';

const INVALID_TOKEN = { error: 'The access token is invalid' };

describe('mastodonAuthn', () => {
  describe('Bearer', () => {
    it('トークンだけで認証し、利用者とスコープを返す', async () => {
      const h = createOAuthHarness();
      const { token, userId } = await h.issueUserToken('read write');

      const response = await h.request('/api/v1/user', { headers: { Authorization: `Bearer ${token}` } });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ source: 'token', userId, scopes: ['read', 'write'] });
    });

    it('無効なトークンは 401 にする', async () => {
      const h = createOAuthHarness();

      const response = await h.request('/api/v1/user', { headers: { Authorization: 'Bearer nope' } });

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual(INVALID_TOKEN);
    });

    it('Bearer 以外の Authorization ヘッダーは 401 にする', async () => {
      const h = createOAuthHarness();

      const response = await h.request('/api/v1/public', { headers: { Authorization: 'Basic Zm9vOmJhcg==' } });

      expect(response.status).toBe(401);
    });

    it('失効したトークンは 401 にする', async () => {
      const h = createOAuthHarness();
      const { token, clientId, clientSecret } = await h.issueUserToken();
      await h.request('/oauth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, token }),
      });

      const response = await h.request('/api/v1/user', { headers: { Authorization: `Bearer ${token}` } });

      expect(response.status).toBe(401);
    });

    it('Cookie が有効でも Bearer を優先し、Cookie を見ない', async () => {
      const h = createOAuthHarness();
      const bearer = await h.issueUserToken();
      const cookieSession = h.memory.addSession();

      const response = await h.request('/api/v1/user', {
        headers: { Authorization: `Bearer ${bearer.token}`, Cookie: `sessionId=${cookieSession.sessionId}` },
      });

      expect(await response.json()).toMatchObject({ source: 'token', userId: bearer.userId });
    });

    it('Bearer が無効なら有効な Cookie があっても 401 にする', async () => {
      const h = createOAuthHarness();
      const { sessionId } = h.memory.addSession();

      const response = await h.request('/api/v1/user', {
        headers: { Authorization: 'Bearer nope', Cookie: `sessionId=${sessionId}` },
      });

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual(INVALID_TOKEN);
    });

    it('Bearer の POST は Origin を検査しない', async () => {
      const h = createOAuthHarness();
      const { token } = await h.issueUserToken();

      const response = await h.request('/api/v1/user', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Origin: 'https://evil.example' },
      });

      expect(response.status).toBe(200);
    });
  });

  describe('Cookie のセッション', () => {
    it('すべてのスコープを持つ利用者として扱う', async () => {
      const h = createOAuthHarness();
      const { sessionId, userId } = h.memory.addSession();

      const response = await h.request('/api/v1/user', { headers: { Cookie: `sessionId=${sessionId}` } });

      expect(await response.json()).toMatchObject({
        source: 'session',
        userId,
        applicationId: null,
        scopes: ['read', 'write', 'follow', 'push', 'profile'],
      });
    });

    it('無効なセッションは未認証として扱う', async () => {
      const h = createOAuthHarness();

      const unknown = await h.request('/api/v1/user', {
        headers: { Cookie: 'sessionId=00000000-0000-4000-8000-000000000000' },
      });
      const garbage = await h.request('/api/v1/user', { headers: { Cookie: 'sessionId=garbage' } });
      const optional = await h.request('/api/v1/public', { headers: { Cookie: 'sessionId=garbage' } });

      expect(unknown.status).toBe(401);
      expect(garbage.status).toBe(401);
      expect(await optional.json()).toEqual({ authenticated: false });
    });

    describe('POST の Origin 検査', () => {
      const post = (headers: Record<string, string>) => {
        const h = createOAuthHarness();
        const { sessionId } = h.memory.addSession();
        return h.request('/api/v1/user', { method: 'POST', headers: { Cookie: `sessionId=${sessionId}`, ...headers } });
      };

      it('Origin が一致すると通す', async () => {
        expect((await post({ Origin: ORIGIN })).status).toBe(200);
      });

      it('Origin が違うと 403 にする', async () => {
        const response = await post({ Origin: 'https://evil.example' });

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'Forbidden' });
      });

      it('Origin が違えば Sec-Fetch-Site が same-origin でも 403 にする', async () => {
        expect((await post({ Origin: 'https://evil.example', 'Sec-Fetch-Site': 'same-origin' })).status).toBe(403);
      });

      it('Origin がなく Sec-Fetch-Site が same-origin のときだけ通す', async () => {
        expect((await post({ 'Sec-Fetch-Site': 'same-origin' })).status).toBe(200);
        expect((await post({ 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
        expect((await post({ 'Sec-Fetch-Site': 'same-site' })).status).toBe(403);
        expect((await post({})).status).toBe(403);
      });

      it('スキームやポートが違う Origin を 403 にする', async () => {
        expect((await post({ Origin: 'http://iori.test' })).status).toBe(403);
        expect((await post({ Origin: 'https://iori.test:8443' })).status).toBe(403);
      });
    });

    it('GET は Origin を検査しない', async () => {
      const h = createOAuthHarness();
      const { sessionId } = h.memory.addSession();

      const response = await h.request('/api/v1/user', {
        headers: { Cookie: `sessionId=${sessionId}`, Origin: 'https://evil.example' },
      });

      expect(response.status).toBe(200);
    });
  });

  describe('requireUser / requireApp / optionalAuth', () => {
    it('未認証を 401 にする', async () => {
      const h = createOAuthHarness();

      const response = await h.request('/api/v1/user');

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual(INVALID_TOKEN);
    });

    it('client_credentials のトークンは利用者向けルートで 401 にする', async () => {
      const h = createOAuthHarness();
      const { token } = await h.issueAppToken();

      const response = await h.request('/api/v1/user', { headers: { Authorization: `Bearer ${token}` } });

      expect(response.status).toBe(401);
    });

    it('スコープが足りないと 403 にする', async () => {
      const h = createOAuthHarness();
      const { token } = await h.issueUserToken('write');

      const response = await h.request('/api/v1/statuses', { headers: { Authorization: `Bearer ${token}` } });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'This action is outside the authorized scopes' });
    });

    it('複数のスコープはいずれか 1 つを満たせばよい', async () => {
      const h = createOAuthHarness();
      const profile = await h.issueUserToken('read:statuses write');
      const denied = await h.request('/api/v1/account', { headers: { Authorization: `Bearer ${profile.token}` } });
      const accounts = await h.issueUserToken('read:accounts');
      const allowed = await h.request('/api/v1/account', { headers: { Authorization: `Bearer ${accounts.token}` } });

      expect(denied.status).toBe(403);
      expect(allowed.status).toBe(200);
    });

    it('optionalAuth は未認証でも通し、トークンがあれば認証する', async () => {
      const h = createOAuthHarness();
      const { token } = await h.issueUserToken();

      const anonymous = await h.request('/api/v1/public');
      const authenticated = await h.request('/api/v1/public', { headers: { Authorization: `Bearer ${token}` } });

      expect(await anonymous.json()).toEqual({ authenticated: false });
      expect(await authenticated.json()).toEqual({ authenticated: true });
    });

    it('requireApp は client_credentials のトークンを通し、未認証を 401 にする', async () => {
      const h = createOAuthHarness();
      const { token } = await h.issueAppToken();

      const allowed = await h.request('/api/v1/app', { headers: { Authorization: `Bearer ${token}` } });
      const denied = await h.request('/api/v1/app');

      expect(allowed.status).toBe(200);
      expect(denied.status).toBe(401);
    });
  });
});
