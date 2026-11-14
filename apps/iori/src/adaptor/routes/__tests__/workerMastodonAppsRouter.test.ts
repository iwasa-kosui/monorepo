import { describe, expect, it } from 'vitest';

import { createOAuthHarness, form } from './helper/oauthHarness.ts';

describe('createWorkerMastodonAppsRouter', () => {
  describe('POST /api/v1/apps', () => {
    it('JSON でアプリを登録し、CredentialApplication を返す', async () => {
      const h = createOAuthHarness();

      const response = await h.request('/api/v1/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: 'Ivory',
          redirect_uris: ['ivory://oauth/callback'],
          scopes: 'read write follow push',
          website: 'https://tapbots.com',
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json() as Record<string, unknown>;
      expect(body).toMatchObject({
        name: 'Ivory',
        website: 'https://tapbots.com',
        scopes: ['read', 'write', 'follow', 'push'],
        redirect_uris: ['ivory://oauth/callback'],
        redirect_uri: 'ivory://oauth/callback',
        client_secret_expires_at: 0,
      });
      expect(body['client_id']).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(body['client_secret']).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(typeof body['id']).toBe('string');
    });

    it('form-urlencoded で登録でき、redirect_uris の改行区切りと scopes の省略を受け付ける', async () => {
      const h = createOAuthHarness();

      const response = await h.request(
        '/api/v1/apps',
        form({ client_name: 'App', redirect_uris: 'https://a.example/cb\nurn:ietf:wg:oauth:2.0:oob' }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        scopes: ['read'],
        website: null,
        redirect_uris: ['https://a.example/cb', 'urn:ietf:wg:oauth:2.0:oob'],
        redirect_uri: 'https://a.example/cb\nurn:ietf:wg:oauth:2.0:oob',
      });
    });

    it.each([
      ['client_name がない', { redirect_uris: 'https://a.example/cb' }],
      ['redirect_uris が javascript:', { client_name: 'App', redirect_uris: 'javascript:alert(1)' }],
      ['scopes が未知', { client_name: 'App', redirect_uris: 'https://a.example/cb', scopes: 'admin' }],
    ])('%s と 422 にする', async (_label, values) => {
      const h = createOAuthHarness();

      const response = await h.request('/api/v1/apps', form(values));

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: expect.any(String) });
      expect(h.memory.applications.size).toBe(0);
    });

    it('本文が JSON として壊れていると 422 にする', async () => {
      const h = createOAuthHarness();

      const response = await h.request('/api/v1/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      });

      expect(response.status).toBe(422);
    });
  });

  describe('GET /api/v1/apps/verify_credentials', () => {
    it('client_credentials のトークンでアプリを返し、秘密の値を含めない', async () => {
      const h = createOAuthHarness();
      const { token, application } = await h.issueAppToken();

      const response = await h.request('/api/v1/apps/verify_credentials', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(200);
      const body = await response.json() as Record<string, unknown>;
      expect(body).toEqual({
        id: application.id,
        name: 'Test App',
        website: null,
        scopes: ['read', 'write', 'follow'],
        redirect_uris: ['https://app.example/callback'],
        redirect_uri: 'https://app.example/callback',
      });
    });

    it('利用者のトークンでも、そのトークンを発行したアプリを返す', async () => {
      const h = createOAuthHarness();
      const { token, application } = await h.issueUserToken();

      const response = await h.request('/api/v1/apps/verify_credentials', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(await response.json()).toMatchObject({ id: application.id });
    });

    it('トークンがない、または無効なときは 401 にする', async () => {
      const h = createOAuthHarness();

      const none = await h.request('/api/v1/apps/verify_credentials');
      const invalid = await h.request('/api/v1/apps/verify_credentials', { headers: { Authorization: 'Bearer nope' } });

      expect(none.status).toBe(401);
      expect(invalid.status).toBe(401);
      expect(await invalid.json()).toEqual({ error: 'The access token is invalid' });
    });

    it('Cookie のセッションはアプリに結び付かないので 401 にする', async () => {
      const h = createOAuthHarness();
      const { sessionId } = h.memory.addSession();

      const response = await h.request('/api/v1/apps/verify_credentials', {
        headers: { Cookie: `sessionId=${sessionId}` },
      });

      expect(response.status).toBe(401);
    });
  });
});
