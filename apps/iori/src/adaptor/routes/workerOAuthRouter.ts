import { RA } from '@iwasa-kosui/result';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';

import { Instant } from '../../domain/instant/instant.ts';
import type { OAuthError, OAuthErrorCode } from '../../domain/oauth/oauthError.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import type { SessionResolver } from '../../domain/session/session.ts';
import { SessionId } from '../../domain/session/sessionId.ts';
import type { ExchangeTokenUseCase } from '../../useCase/exchangeToken.ts';
import { resolveSessionWith } from '../../useCase/helper/resolve.ts';
import type { IssueAuthorizationCodeUseCase } from '../../useCase/issueAuthorizationCode.ts';
import type { RevokeTokenUseCase } from '../../useCase/revokeToken.ts';
import type { ValidateAuthorizationRequestUseCase } from '../../useCase/validateAuthorizationRequest.ts';
import { type AuthorizeFields, createAuthorizeCsrfToken, verifyAuthorizeCsrfToken } from './helper/oauthCsrf.ts';
import { renderConsentPage, renderErrorPage, renderOobCodePage } from './helper/oauthPages.ts';
import { bodyString, readRequestBody, type RequestBody } from './helper/requestBody.ts';
import { isSameOriginRequest } from './mastodonAuthn.ts';

export type WorkerOAuthRouterDeps = Readonly<{
  validateAuthorizationRequestUseCase: ValidateAuthorizationRequestUseCase;
  issueAuthorizationCodeUseCase: IssueAuthorizationCodeUseCase;
  exchangeTokenUseCase: ExchangeTokenUseCase;
  revokeTokenUseCase: RevokeTokenUseCase;
  sessionResolver: SessionResolver;
}>;

const HTML_SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': 'frame-ancestors \'none\'',
  'Cache-Control': 'no-store',
} as const;

const OAUTH_ERROR_STATUS: Readonly<Record<OAuthErrorCode, 400 | 401 | 403>> = {
  invalid_request: 400,
  invalid_client: 401,
  invalid_grant: 400,
  unauthorized_client: 403,
  unsupported_grant_type: 400,
  unsupported_response_type: 400,
  invalid_scope: 400,
  access_denied: 403,
};

const readSessionId = async (c: Context, sessionResolver: SessionResolver): Promise<SessionId | undefined> => {
  const sessionId = SessionId.parse(getCookie(c, 'sessionId'));
  if (!sessionId.ok) return undefined;
  const session = await resolveSessionWith(sessionResolver, Instant.now())(sessionId.val);
  return session.ok ? sessionId.val : undefined;
};

const decodeBasicCredentials = (
  header: string | undefined,
): Readonly<{ clientId: string; clientSecret: string }> | undefined => {
  const match = header === undefined ? null : /^Basic\s+(\S+)$/i.exec(header.trim());
  if (match === null) return undefined;
  try {
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(match[1]!), (char) => char.charCodeAt(0)));
    const separator = decoded.indexOf(':');
    if (separator < 0) return { clientId: '', clientSecret: '' };
    return {
      clientId: decodeURIComponent(decoded.slice(0, separator).replaceAll('+', ' ')),
      clientSecret: decodeURIComponent(decoded.slice(separator + 1).replaceAll('+', ' ')),
    };
  } catch {
    return { clientId: '', clientSecret: '' };
  }
};

const clientCredentials = (c: Context, body: RequestBody) => {
  const basic = decodeBasicCredentials(c.req.header('Authorization'));
  return {
    usedBasic: basic !== undefined,
    clientId: basic?.clientId ?? bodyString(body, 'client_id'),
    clientSecret: basic?.clientSecret ?? bodyString(body, 'client_secret'),
  };
};

const oauthErrorResponse = (c: Context, error: OAuthError, usedBasic: boolean) => {
  const status = OAUTH_ERROR_STATUS[error.error];
  const headers: Record<string, string> = { 'Cache-Control': 'no-store', Pragma: 'no-cache' };
  if (status === 401 && usedBasic) {
    headers['WWW-Authenticate'] = 'Basic realm="iori"';
  }
  return c.json({ error: error.error, error_description: error.message }, status, headers);
};

const authorizeFields = (read: (key: string) => string | undefined): AuthorizeFields => ({
  clientId: read('client_id') ?? '',
  redirectUri: read('redirect_uri') ?? '',
  scope: read('scope') ?? '',
  state: read('state') ?? '',
  codeChallenge: read('code_challenge') ?? '',
  codeChallengeMethod: read('code_challenge_method') ?? '',
});

const redirectTo = (c: Context, redirectUri: string, params: Readonly<Record<string, string | undefined>>) => {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value.length > 0) url.searchParams.set(key, value);
  }
  return c.redirect(url.toString(), 302);
};

const errorPage = (c: Context, message: string, status: 400 | 401 | 403) =>
  c.html(renderErrorPage(message), status, HTML_SECURITY_HEADERS);

export const createWorkerOAuthRouter = ({
  validateAuthorizationRequestUseCase,
  issueAuthorizationCodeUseCase,
  exchangeTokenUseCase,
  revokeTokenUseCase,
  sessionResolver,
}: WorkerOAuthRouterDeps): Hono =>
  new Hono()
    .get('/oauth/authorize', async (c) => {
      const fields = authorizeFields((key) => c.req.query(key));
      const validated = await validateAuthorizationRequestUseCase.run({
        clientId: c.req.query('client_id'),
        redirectUri: c.req.query('redirect_uri'),
        scope: c.req.query('scope'),
        codeChallenge: c.req.query('code_challenge'),
        codeChallengeMethod: c.req.query('code_challenge_method'),
      });
      if (!validated.ok) {
        return validated.err.type === 'UnredirectableAuthorizationError'
            || fields.redirectUri === 'urn:ietf:wg:oauth:2.0:oob'
          ? errorPage(c, validated.err.message, 400)
          : redirectTo(c, fields.redirectUri, {
            error: validated.err.error,
            error_description: validated.err.message,
            state: fields.state,
          });
      }
      if (c.req.query('response_type') !== 'code') {
        return validated.val.redirectUri === 'urn:ietf:wg:oauth:2.0:oob'
          ? errorPage(c, 'response_type must be code.', 400)
          : redirectTo(c, fields.redirectUri, {
            error: 'unsupported_response_type',
            error_description: 'response_type must be code.',
            state: fields.state,
          });
      }

      const sessionId = await readSessionId(c, sessionResolver);
      if (sessionId === undefined) {
        const url = new URL(c.req.url);
        return c.redirect(`/sign-in?next=${encodeURIComponent(url.pathname + url.search)}`, 302);
      }

      const csrfToken = await createAuthorizeCsrfToken(sessionId, fields);
      return c.html(
        renderConsentPage({
          application: validated.val.application,
          scopes: validated.val.scopes,
          hiddenFields: [
            ['client_id', fields.clientId],
            ['redirect_uri', fields.redirectUri],
            ['scope', fields.scope],
            ['state', fields.state],
            ['code_challenge', fields.codeChallenge],
            ['code_challenge_method', fields.codeChallengeMethod],
            ['response_type', 'code'],
            ['csrf_token', csrfToken],
          ],
        }),
        200,
        HTML_SECURITY_HEADERS,
      );
    })
    .post('/oauth/authorize', async (c) => {
      if (!isSameOriginRequest(c.req.raw)) {
        return c.json({ error: 'Forbidden' }, 403);
      }
      const body = await readRequestBody(c);
      const fields = authorizeFields((key) => bodyString(body, key));
      const sessionId = await readSessionId(c, sessionResolver);
      if (sessionId === undefined) {
        return errorPage(c, 'Your session has expired. Sign in again.', 401);
      }
      if (!(await verifyAuthorizeCsrfToken(sessionId, fields, bodyString(body, 'csrf_token')))) {
        return errorPage(c, 'The request could not be verified. Go back and try again.', 403);
      }

      const request = {
        clientId: bodyString(body, 'client_id'),
        redirectUri: bodyString(body, 'redirect_uri'),
        scope: bodyString(body, 'scope'),
        codeChallenge: bodyString(body, 'code_challenge'),
        codeChallengeMethod: bodyString(body, 'code_challenge_method'),
      };
      const respondWithError = (error: OAuthError, redirectUri: string) =>
        redirectUri === 'urn:ietf:wg:oauth:2.0:oob'
          ? errorPage(c, error.message, 400)
          : redirectTo(c, redirectUri, {
            error: error.error,
            error_description: error.message,
            state: fields.state,
          });

      const validated = await validateAuthorizationRequestUseCase.run(request);
      if (!validated.ok) {
        return validated.err.type === 'UnredirectableAuthorizationError'
          ? errorPage(c, validated.err.message, 400)
          : respondWithError(validated.err, fields.redirectUri);
      }
      if (bodyString(body, 'decision') !== 'approve') {
        return respondWithError(
          { type: 'OAuthError', error: 'access_denied', message: 'The resource owner denied the request.' },
          validated.val.redirectUri,
        );
      }

      const issued = await issueAuthorizationCodeUseCase.run({ ...request, sessionId });
      if (!issued.ok) {
        switch (issued.err.type) {
          case 'OAuthError':
            return respondWithError(issued.err, validated.val.redirectUri);
          case 'UnredirectableAuthorizationError':
            return errorPage(c, issued.err.message, 400);
          default:
            return errorPage(c, 'Your session has expired. Sign in again.', 401);
        }
      }
      return issued.val.redirectUri === 'urn:ietf:wg:oauth:2.0:oob'
        ? c.html(renderOobCodePage(issued.val.code), 200, HTML_SECURITY_HEADERS)
        : redirectTo(c, issued.val.redirectUri, { code: issued.val.code, state: fields.state });
    })
    .post('/oauth/token', async (c) => {
      const body = await readRequestBody(c);
      const credentials = clientCredentials(c, body);
      return RA.flow(
        exchangeTokenUseCase.run({
          grantType: bodyString(body, 'grant_type'),
          clientId: credentials.clientId,
          clientSecret: credentials.clientSecret,
          code: bodyString(body, 'code'),
          redirectUri: bodyString(body, 'redirect_uri'),
          codeVerifier: bodyString(body, 'code_verifier'),
          scope: bodyString(body, 'scope'),
        }),
        RA.match({
          ok: ({ accessToken, scopes, createdAt }) =>
            c.json(
              {
                access_token: accessToken,
                token_type: 'Bearer',
                scope: Scope.serialize(scopes),
                created_at: Math.floor(createdAt / 1000),
              },
              200,
              { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
            ),
          err: (error) => oauthErrorResponse(c, error, credentials.usedBasic),
        }),
      );
    })
    .post('/oauth/revoke', async (c) => {
      const body = await readRequestBody(c);
      const credentials = clientCredentials(c, body);
      return RA.flow(
        revokeTokenUseCase.run({
          clientId: credentials.clientId,
          clientSecret: credentials.clientSecret,
          token: bodyString(body, 'token'),
        }),
        RA.match({
          ok: () => c.json({}, 200, { 'Cache-Control': 'no-store' }),
          err: (error) => oauthErrorResponse(c, error, credentials.usedBasic),
        }),
      );
    })
    .get('/.well-known/oauth-authorization-server', (c) => {
      const origin = new URL(c.req.url).origin;
      return c.json({
        issuer: origin,
        service_documentation: 'https://docs.joinmastodon.org/',
        authorization_endpoint: `${origin}/oauth/authorize`,
        token_endpoint: `${origin}/oauth/token`,
        app_registration_endpoint: `${origin}/api/v1/apps`,
        revocation_endpoint: `${origin}/oauth/revoke`,
        scopes_supported: [...Scope.all],
        response_types_supported: ['code'],
        response_modes_supported: ['query'],
        code_challenge_methods_supported: ['S256'],
        grant_types_supported: ['authorization_code', 'client_credentials'],
        token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      });
    });
