import { describe, expect, it } from 'vitest';

import { createOAuthHarness, form, ORIGIN, REDIRECT_URI } from './helper/oauthHarness.ts';

const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

type Harness = ReturnType<typeof createOAuthHarness>;

const authorizeQuery = (clientId: string, overrides: Record<string, string> = {}) =>
  new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: 'read write',
    state: 'xyz',
    ...overrides,
  }).toString();

const expectHtmlSecurityHeaders = (response: Response) => {
  expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  expect(response.headers.get('Content-Security-Policy')).toBe('frame-ancestors \'none\'');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
};

const hiddenFields = (html: string): Record<string, string> => {
  const fields: Record<string, string> = {};
  for (const match of html.matchAll(/<input type="hidden" name="([^"]*)" value="([^"]*)">/g)) {
    fields[match[1]!] = match[2]!.replaceAll('&amp;', '&');
  }
  return fields;
};

const consent = async (h: Harness, clientId: string, sessionId: string, overrides: Record<string, string> = {}) => {
  const response = await h.request(`/oauth/authorize?${authorizeQuery(clientId, overrides)}`, {
    headers: { Cookie: `sessionId=${sessionId}` },
  });
  return { response, fields: hiddenFields(await response.text()) };
};

const postAuthorize = (
  h: Harness,
  sessionId: string,
  fields: Record<string, string>,
  decision: string,
  headers: Record<string, string> = { Origin: ORIGIN },
) => {
  const base = form({ ...fields, decision });
  return h.request('/oauth/authorize', {
    ...base,
    headers: { ...base.headers, Cookie: `sessionId=${sessionId}`, ...headers },
  });
};

describe('GET /oauth/authorize', () => {
  it('未知の client_id はリダイレクトせずエラー画面にする', async () => {
    const h = createOAuthHarness();
    const { sessionId } = h.memory.addSession();

    const response = await h.request(`/oauth/authorize?${authorizeQuery('unknown')}`, {
      headers: { Cookie: `sessionId=${sessionId}` },
    });

    expect(response.status).toBe(400);
    expect(response.headers.get('Location')).toBeNull();
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expectHtmlSecurityHeaders(response);
  });

  it('登録と一致しない redirect_uri はリダイレクトせずエラー画面にする', async () => {
    const h = createOAuthHarness();
    const { clientId } = await h.registerApp();

    const response = await h.request(
      `/oauth/authorize?${authorizeQuery(clientId, { redirect_uri: 'https://evil.example/cb' })}`,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('Location')).toBeNull();
    expectHtmlSecurityHeaders(response);
  });

  it('セッションがなければ next 付きでサインインへリダイレクトする', async () => {
    const h = createOAuthHarness();
    const { clientId } = await h.registerApp();
    const query = authorizeQuery(clientId);

    const response = await h.request(`/oauth/authorize?${query}`);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(
      `/sign-in?next=${encodeURIComponent(`/oauth/authorize?${query}`)}`,
    );
  });

  it('期限切れのセッションもサインインへリダイレクトする', async () => {
    const h = createOAuthHarness();
    const { clientId } = await h.registerApp();
    const { sessionId } = h.memory.addSession(undefined, 1 as never);

    const response = await h.request(`/oauth/authorize?${authorizeQuery(clientId)}`, {
      headers: { Cookie: `sessionId=${sessionId}` },
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toMatch(/^\/sign-in\?next=/);
  });

  it('セッションがあれば同意画面を返し、アプリ名、スコープ、ボタン、CSRF トークンを含める', async () => {
    const h = createOAuthHarness();
    const { clientId } = await h.registerApp({ name: '<script>alert(1)</script>' });
    const { sessionId } = h.memory.addSession();

    const { response, fields } = await consent(h, clientId, sessionId);
    const html = await (await h.request(`/oauth/authorize?${authorizeQuery(clientId)}`, {
      headers: { Cookie: `sessionId=${sessionId}` },
    })).text();

    expect(response.status).toBe(200);
    expectHtmlSecurityHeaders(response);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('<code>read</code>');
    expect(html).toContain('<code>write</code>');
    expect(html).toContain('name="decision" value="approve"');
    expect(html).toContain('name="decision" value="deny"');
    expect(fields).toMatchObject({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      scope: 'read write',
      state: 'xyz',
      code_challenge: '',
      code_challenge_method: '',
    });
    expect(fields['csrf_token']).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('scope を省略すると read の同意画面にする', async () => {
    const h = createOAuthHarness();
    const { clientId } = await h.registerApp();
    const { sessionId } = h.memory.addSession();
    const query = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT_URI });

    const response = await h.request(`/oauth/authorize?${query}`, { headers: { Cookie: `sessionId=${sessionId}` } });
    const html = await response.text();

    expect(html).toContain('<code>read</code>');
    expect(html).not.toContain('<code>write</code>');
  });

  it('登録スコープより広い scope は redirect_uri へ invalid_scope と state を付けて返す', async () => {
    const h = createOAuthHarness();
    const { clientId } = await h.registerApp({ scopes: 'read' });

    const response = await h.request(`/oauth/authorize?${authorizeQuery(clientId, { scope: 'read write' })}`);

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('Location')!);
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT_URI);
    expect(location.searchParams.get('error')).toBe('invalid_scope');
    expect(location.searchParams.get('state')).toBe('xyz');
  });

  it('response_type が code でなければ unsupported_response_type にする', async () => {
    const h = createOAuthHarness();
    const { clientId } = await h.registerApp();

    const response = await h.request(`/oauth/authorize?${authorizeQuery(clientId, { response_type: 'token' })}`);

    expect(response.status).toBe(302);
    expect(new URL(response.headers.get('Location')!).searchParams.get('error')).toBe('unsupported_response_type');
  });

  it('PKCE の code_challenge を同意画面の隠しフィールドに引き継ぐ', async () => {
    const h = createOAuthHarness();
    const { clientId } = await h.registerApp();
    const { sessionId } = h.memory.addSession();

    const { fields } = await consent(h, clientId, sessionId, {
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
    });

    expect(fields).toMatchObject({ code_challenge: CHALLENGE, code_challenge_method: 'S256' });
  });
});

describe('POST /oauth/authorize', () => {
  const setupConsent = async (overrides: Record<string, string> = {}, registerOverrides = {}) => {
    const h = createOAuthHarness();
    const { clientId, clientSecret } = await h.registerApp(registerOverrides);
    const session = h.memory.addSession();
    const { fields } = await consent(h, clientId, session.sessionId, overrides);
    return { h, clientId, clientSecret, fields, ...session };
  };

  it('許可すると code と state を付けて redirect_uri へ 302 にし、コードをトークンに交換できる', async () => {
    const { h, fields, sessionId, clientId, clientSecret, userId } = await setupConsent();

    const response = await postAuthorize(h, sessionId, fields, 'approve');

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('Location')!);
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT_URI);
    expect(location.searchParams.get('state')).toBe('xyz');
    const code = location.searchParams.get('code')!;
    const token = await h.request(
      '/oauth/token',
      form({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: REDIRECT_URI,
      }),
    );
    expect(token.status).toBe(200);
    const body = await token.json() as { access_token: string };
    const principal = await h.request('/api/v1/user', { headers: { Authorization: `Bearer ${body.access_token}` } });
    expect(await principal.json()).toMatchObject({ userId, scopes: ['read', 'write'] });
  });

  it('カスタムスキームの redirect_uri へ code を付けて 302 にする', async () => {
    const h = createOAuthHarness();
    const { clientId } = await h.registerApp({ redirectUris: ['ivory://oauth/callback?from=app'] });
    const session = h.memory.addSession();
    const { fields } = await consent(h, clientId, session.sessionId, {
      redirect_uri: 'ivory://oauth/callback?from=app',
    });

    const response = await postAuthorize(h, session.sessionId, fields, 'approve');

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('Location')!);
    expect(location.protocol).toBe('ivory:');
    expect(location.searchParams.get('from')).toBe('app');
    expect(location.searchParams.get('code')).toBeTruthy();
  });

  it('拒否すると error=access_denied と state を付けて 302 にし、コードを発行しない', async () => {
    const { h, fields, sessionId } = await setupConsent();

    const response = await postAuthorize(h, sessionId, fields, 'deny');

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('Location')!);
    expect(location.searchParams.get('error')).toBe('access_denied');
    expect(location.searchParams.get('state')).toBe('xyz');
    expect(location.searchParams.get('code')).toBeNull();
    expect(h.memory.codes.size).toBe(0);
  });

  it('oob の redirect_uri ならコードを画面に表示する', async () => {
    const h = createOAuthHarness();
    const { clientId } = await h.registerApp({ redirectUris: ['urn:ietf:wg:oauth:2.0:oob'] });
    const session = h.memory.addSession();
    const { fields } = await consent(h, clientId, session.sessionId, { redirect_uri: 'urn:ietf:wg:oauth:2.0:oob' });

    const response = await postAuthorize(h, session.sessionId, fields, 'approve');

    expect(response.status).toBe(200);
    expectHtmlSecurityHeaders(response);
    expect(await response.text()).toMatch(/<code>[A-Za-z0-9_-]{43}<\/code>/);
    expect(h.memory.codes.size).toBe(1);
  });

  describe('Origin の検査', () => {
    it('Origin が違うと 403 にし、コードを発行しない', async () => {
      const { h, fields, sessionId } = await setupConsent();

      const response = await postAuthorize(h, sessionId, fields, 'approve', { Origin: 'https://evil.example' });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'Forbidden' });
      expect(h.memory.codes.size).toBe(0);
    });

    it('Origin がなく Sec-Fetch-Site が same-origin なら通す', async () => {
      const { h, fields, sessionId } = await setupConsent();

      const response = await postAuthorize(h, sessionId, fields, 'approve', { 'Sec-Fetch-Site': 'same-origin' });

      expect(response.status).toBe(302);
    });

    it('Origin も Sec-Fetch-Site もなければ 403 にする', async () => {
      const { h, fields, sessionId } = await setupConsent();

      const response = await postAuthorize(h, sessionId, fields, 'approve', {});

      expect(response.status).toBe(403);
    });
  });

  describe('CSRF トークンの検査', () => {
    it('トークンがないと 403 にする', async () => {
      const { h, fields, sessionId } = await setupConsent();
      const { csrf_token: _removed, ...withoutToken } = fields;

      const response = await postAuthorize(h, sessionId, withoutToken, 'approve');

      expect(response.status).toBe(403);
      expectHtmlSecurityHeaders(response);
      expect(h.memory.codes.size).toBe(0);
    });

    it('改ざんしたトークンを 403 にする', async () => {
      const { h, fields, sessionId } = await setupConsent();

      const response = await postAuthorize(h, sessionId, {
        ...fields,
        csrf_token: `${fields['csrf_token']![0] === 'A' ? 'B' : 'A'}${fields['csrf_token']!.slice(1)}`,
      }, 'approve');

      expect(response.status).toBe(403);
    });

    it.each(['client_id', 'redirect_uri', 'scope', 'state', 'code_challenge', 'code_challenge_method'])(
      '%s を書き換えるとトークンが一致せず 403 にする',
      async (key) => {
        const h = createOAuthHarness();
        const { clientId } = await h.registerApp({ redirectUris: [REDIRECT_URI, 'https://app.example/other'] });
        const session = h.memory.addSession();
        const { fields } = await consent(h, clientId, session.sessionId, {
          code_challenge: CHALLENGE,
          code_challenge_method: 'S256',
        });
        const tampered = { ...fields, [key]: key === 'redirect_uri' ? 'https://app.example/other' : `${fields[key]}x` };

        const response = await postAuthorize(h, session.sessionId, tampered, 'approve');

        expect(response.status).toBe(403);
        expect(h.memory.codes.size).toBe(0);
      },
    );

    it('別のセッションで作ったトークンを 403 にする', async () => {
      const { h, fields, clientId } = await setupConsent();
      const other = h.memory.addSession();
      expect(clientId).toBeTruthy();

      const response = await postAuthorize(h, other.sessionId, fields, 'approve');

      expect(response.status).toBe(403);
    });
  });

  it('セッションがなければ 401 にする', async () => {
    const { h, fields } = await setupConsent();
    const base = form({ ...fields, decision: 'approve' });

    const response = await h.request('/oauth/authorize', { ...base, headers: { ...base.headers, Origin: ORIGIN } });

    expect(response.status).toBe(401);
    expect(h.memory.codes.size).toBe(0);
  });

  it('PKCE の code_challenge を認可コードに結び付ける', async () => {
    const { h, fields, sessionId, clientId, clientSecret } = await setupConsent({
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
    });

    const response = await postAuthorize(h, sessionId, fields, 'approve');
    const code = new URL(response.headers.get('Location')!).searchParams.get('code')!;
    const exchange = (codeVerifier: string) =>
      h.request(
        '/oauth/token',
        form({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: REDIRECT_URI,
          code_verifier: codeVerifier,
        }),
      );

    expect((await exchange('x'.repeat(43))).status).toBe(400);
    expect((await exchange(VERIFIER)).status).toBe(200);
  });
});

describe('POST /oauth/token', () => {
  const authorizationCode = async (h: Harness) => {
    const registered = await h.registerApp();
    const session = h.memory.addSession();
    const issued = await h.memory.useCases.issueAuthorizationCodeUseCase.run({
      sessionId: session.sessionId,
      clientId: registered.clientId,
      redirectUri: REDIRECT_URI,
      scope: 'read write',
      codeChallenge: undefined,
      codeChallengeMethod: undefined,
    });
    if (!issued.ok) throw new Error('code not issued');
    return { ...registered, code: issued.val.code };
  };

  const basic = (id: string, secret: string) => `Basic ${btoa(`${id}:${secret}`)}`;

  it('form で交換し、RFC 6749 の形で返す', async () => {
    const h = createOAuthHarness();
    const { clientId, clientSecret, code } = await authorizationCode(h);
    const before = Math.floor(Date.now() / 1000);

    const response = await h.request(
      '/oauth/token',
      form({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: REDIRECT_URI,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({ token_type: 'Bearer', scope: 'read write' });
    expect(typeof body['access_token']).toBe('string');
    expect(body['created_at']).toBeGreaterThanOrEqual(before);
    expect(Object.keys(body).sort()).toEqual(['access_token', 'created_at', 'scope', 'token_type']);
  });

  it('JSON でも交換できる', async () => {
    const h = createOAuthHarness();
    const { clientId, clientSecret, code } = await authorizationCode(h);

    const response = await h.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    expect(response.status).toBe(200);
  });

  it('HTTP Basic の client 認証で交換できる', async () => {
    const h = createOAuthHarness();
    const { clientId, clientSecret, code } = await authorizationCode(h);

    const response = await h.request('/oauth/token', {
      ...form({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basic(clientId, clientSecret),
      },
    });

    expect(response.status).toBe(200);
  });

  it('client_credentials でトークンを発行する', async () => {
    const h = createOAuthHarness();
    const { clientId, clientSecret } = await h.registerApp();

    const response = await h.request(
      '/oauth/token',
      form({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ token_type: 'Bearer', scope: 'read' });
  });

  it('client_secret が違うと 401 invalid_client にする', async () => {
    const h = createOAuthHarness();
    const { clientId } = await h.registerApp();

    const response = await h.request(
      '/oauth/token',
      form({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: 'wrong',
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ error: 'invalid_client', error_description: expect.any(String) });
  });

  it('Basic で認証に失敗したときは WWW-Authenticate を付ける', async () => {
    const h = createOAuthHarness();
    const { clientId } = await h.registerApp();

    const response = await h.request('/oauth/token', {
      ...form({ grant_type: 'client_credentials' }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basic(clientId, 'wrong'),
      },
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toContain('Basic');
  });

  it('client 認証がないと 401 invalid_client にする', async () => {
    const h = createOAuthHarness();

    const response = await h.request('/oauth/token', form({ grant_type: 'client_credentials' }));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: 'invalid_client' });
  });

  it('使用済みのコードは 400 invalid_grant にする', async () => {
    const h = createOAuthHarness();
    const { clientId, clientSecret, code } = await authorizationCode(h);
    const request = () =>
      h.request(
        '/oauth/token',
        form({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: REDIRECT_URI,
        }),
      );
    expect((await request()).status).toBe(200);

    const second = await request();

    expect(second.status).toBe(400);
    expect(await second.json()).toMatchObject({ error: 'invalid_grant' });
  });

  it('grant_type の欠落は invalid_request、未対応は unsupported_grant_type にする', async () => {
    const h = createOAuthHarness();
    const { clientId, clientSecret } = await h.registerApp();
    const credentials = { client_id: clientId, client_secret: clientSecret };

    const missing = await h.request('/oauth/token', form(credentials));
    const unsupported = await h.request('/oauth/token', form({ ...credentials, grant_type: 'password' }));

    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ error: 'invalid_request' });
    expect(unsupported.status).toBe(400);
    expect(await unsupported.json()).toMatchObject({ error: 'unsupported_grant_type' });
  });

  it('登録スコープ外の scope は invalid_scope にする', async () => {
    const h = createOAuthHarness();
    const { clientId, clientSecret } = await h.registerApp({ scopes: 'read' });

    const response = await h.request(
      '/oauth/token',
      form({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'write',
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_scope' });
  });

  it('本文が JSON として壊れているときは 400 invalid_request にする', async () => {
    const h = createOAuthHarness();

    const response = await h.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_request' });
  });
});

describe('POST /oauth/revoke', () => {
  it('トークンを失効させ、200 {} を返す', async () => {
    const h = createOAuthHarness();
    const { token, clientId, clientSecret } = await h.issueUserToken();

    const response = await h.request(
      '/oauth/revoke',
      form({ client_id: clientId, client_secret: clientSecret, token }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
    const after = await h.request('/api/v1/user', { headers: { Authorization: `Bearer ${token}` } });
    expect(after.status).toBe(401);
  });

  it('存在しないトークンは 200 {} にする', async () => {
    const h = createOAuthHarness();
    const { clientId, clientSecret } = await h.registerApp();

    const response = await h.request(
      '/oauth/revoke',
      form({ client_id: clientId, client_secret: clientSecret, token: 'nope' }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
  });

  it('別のアプリのトークンは 403 unauthorized_client にし、失効させない', async () => {
    const h = createOAuthHarness();
    const { token } = await h.issueUserToken();
    const other = await h.registerApp();

    const response = await h.request(
      '/oauth/revoke',
      form({
        client_id: other.clientId,
        client_secret: other.clientSecret,
        token,
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'unauthorized_client' });
    const after = await h.request('/api/v1/user', { headers: { Authorization: `Bearer ${token}` } });
    expect(after.status).toBe(200);
  });

  it('client_secret が違うと 401 invalid_client にする', async () => {
    const h = createOAuthHarness();
    const { token, clientId } = await h.issueUserToken();

    const response = await h.request('/oauth/revoke', form({ client_id: clientId, client_secret: 'wrong', token }));

    expect(response.status).toBe(401);
  });
});

describe('GET /.well-known/oauth-authorization-server', () => {
  it('RFC 8414 のメタデータを返す', async () => {
    const h = createOAuthHarness();

    const response = await h.request('/.well-known/oauth-authorization-server');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      issuer: ORIGIN,
      service_documentation: 'https://docs.joinmastodon.org/',
      authorization_endpoint: `${ORIGIN}/oauth/authorize`,
      token_endpoint: `${ORIGIN}/oauth/token`,
      app_registration_endpoint: `${ORIGIN}/api/v1/apps`,
      revocation_endpoint: `${ORIGIN}/oauth/revoke`,
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      code_challenge_methods_supported: ['S256'],
      grant_types_supported: ['authorization_code', 'client_credentials'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      scopes_supported: expect.arrayContaining(['read', 'write', 'follow', 'push', 'profile', 'read:statuses']),
    });
  });
});
