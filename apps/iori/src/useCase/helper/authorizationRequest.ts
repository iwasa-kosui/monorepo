import { RA } from '@iwasa-kosui/result';

import { ClientId } from '../../domain/oauth/ids.ts';
import type { OAuthApplication, OAuthApplicationResolverByClientId } from '../../domain/oauth/oauthApplication.ts';
import { OAuthError, UnredirectableAuthorizationError } from '../../domain/oauth/oauthError.ts';
import { CodeChallenge, type CodeChallengeMethod } from '../../domain/oauth/pkce.ts';
import type { RedirectUri } from '../../domain/oauth/redirectUri.ts';
import { Scope } from '../../domain/oauth/scope.ts';

export type AuthorizationRequestInput = Readonly<{
  clientId: string | undefined;
  redirectUri: string | undefined;
  scope: string | undefined;
  codeChallenge: string | undefined;
  codeChallengeMethod: string | undefined;
}>;

export type ValidatedAuthorizationRequest = Readonly<{
  application: OAuthApplication;
  redirectUri: RedirectUri;
  scopes: ReadonlyArray<Scope>;
  codeChallenge: CodeChallenge | null;
  codeChallengeMethod: CodeChallengeMethod | null;
}>;

export type AuthorizationRequestError = OAuthError | UnredirectableAuthorizationError;

const blankToUndefined = (value: string | undefined): string | undefined =>
  value === undefined || value.length === 0 ? undefined : value;

export const validateAuthorizationRequestWith =
  (resolver: OAuthApplicationResolverByClientId) =>
  (input: AuthorizationRequestInput): RA<ValidatedAuthorizationRequest, AuthorizationRequestError> =>
    RA.flow(
      RA.ok(input),
      RA.andBind('application', ({ clientId }) => {
        const parsed = clientId === undefined ? undefined : ClientId.parse(clientId);
        if (parsed === undefined || !parsed.ok) {
          return RA.err<AuthorizationRequestError>(
            UnredirectableAuthorizationError.create('The client_id is missing or unknown.'),
          );
        }
        return RA.flow(
          resolver.resolve(parsed.val),
          RA.andThen((application) =>
            application === undefined
              ? RA.err<AuthorizationRequestError>(
                UnredirectableAuthorizationError.create('The client_id is missing or unknown.'),
              )
              : RA.ok(application)
          ),
        );
      }),
      RA.andBind('redirectUri', ({ application, redirectUri }) => {
        const registered = application.redirectUris.find((uri) => uri === redirectUri);
        return registered === undefined
          ? RA.err<AuthorizationRequestError>(
            UnredirectableAuthorizationError.create('The redirect_uri does not match a registered value.'),
          )
          : RA.ok(registered);
      }),
      RA.andBind('scopes', ({ application, scope }) => {
        const parsed = Scope.parseList(scope);
        if (!parsed.ok) {
          return RA.err<AuthorizationRequestError>(OAuthError.create('invalid_scope', parsed.err.message));
        }
        return Scope.isSubset(parsed.val, application.scopes)
          ? RA.ok(parsed.val)
          : RA.err<AuthorizationRequestError>(
            OAuthError.create('invalid_scope', 'The requested scope is outside the registered scopes.'),
          );
      }),
      RA.andBind('pkce', ({ codeChallenge, codeChallengeMethod }) => {
        const challenge = blankToUndefined(codeChallenge);
        const method = blankToUndefined(codeChallengeMethod);
        if (challenge === undefined) {
          return method === undefined
            ? RA.ok({ codeChallenge: null, codeChallengeMethod: null })
            : RA.err<AuthorizationRequestError>(
              OAuthError.create('invalid_request', 'code_challenge_method requires code_challenge.'),
            );
        }
        if (method !== 'S256') {
          return RA.err<AuthorizationRequestError>(
            OAuthError.create('invalid_request', 'code_challenge_method must be S256.'),
          );
        }
        const parsed = CodeChallenge.parse(challenge);
        return parsed.ok
          ? RA.ok({ codeChallenge: parsed.val as CodeChallenge | null, codeChallengeMethod: method as 'S256' | null })
          : RA.err<AuthorizationRequestError>(OAuthError.create('invalid_request', 'code_challenge is invalid.'));
      }),
      RA.map(({ application, redirectUri, scopes, pkce }): ValidatedAuthorizationRequest => ({
        application,
        redirectUri,
        scopes,
        codeChallenge: pkce.codeChallenge,
        codeChallengeMethod: pkce.codeChallengeMethod,
      })),
    );
