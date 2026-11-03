import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import { AuthorizationCode, type AuthorizationCodeIssuedStore } from '../domain/oauth/authorizationCode.ts';
import type { OAuthApplicationResolverByClientId } from '../domain/oauth/oauthApplication.ts';
import { OAuthError } from '../domain/oauth/oauthError.ts';
import type { RedirectUri } from '../domain/oauth/redirectUri.ts';
import { Secret } from '../domain/oauth/secret.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import type { SessionId } from '../domain/session/sessionId.ts';
import {
  type AuthorizationRequestError,
  type AuthorizationRequestInput,
  validateAuthorizationRequestWith,
} from './helper/authorizationRequest.ts';
import { resolveSessionWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input =
  & AuthorizationRequestInput
  & Readonly<{
    sessionId: SessionId;
  }>;

type Ok = Readonly<{
  code: string;
  redirectUri: RedirectUri;
}>;

type Err = AuthorizationRequestError | SessionExpiredError;

export type IssueAuthorizationCodeUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  oauthApplicationResolverByClientId: OAuthApplicationResolverByClientId;
  authorizationCodeIssuedStore: AuthorizationCodeIssuedStore;
}>;

const create = ({
  sessionResolver,
  oauthApplicationResolverByClientId,
  authorizationCodeIssuedStore,
}: Deps): IssueAuthorizationCodeUseCase => {
  const validate = validateAuthorizationRequestWith(oauthApplicationResolverByClientId);

  const run = async (input: Input) => {
    const now = Instant.now();
    return RA.flow(
      RA.ok(input),
      RA.andBind('session', ({ sessionId }) => resolveSessionWith(sessionResolver, now)(sessionId)),
      RA.andBind('request', (value) => validate(value)),
      RA.bind('code', () => Secret.generate()),
      RA.bind('codeHash', ({ code }) => Secret.hash(code)),
      RA.andBind('issued', ({ session, request, codeHash }) => {
        const issued = AuthorizationCode.issue(now)({
          codeHash,
          applicationId: request.application.id,
          userId: session.userId,
          redirectUri: request.redirectUri,
          scopes: [...request.scopes],
          codeChallenge: request.codeChallenge,
          codeChallengeMethod: request.codeChallengeMethod,
        });
        return issued.ok
          ? RA.ok(issued.val)
          : RA.err(OAuthError.create('invalid_request', 'The authorization request is invalid.'));
      }),
      RA.andThrough(({ issued }) => authorizationCodeIssuedStore.store(issued)),
      RA.map(({ code, request }): Ok => ({ code, redirectUri: request.redirectUri })),
    );
  };

  return { run };
};

export const IssueAuthorizationCodeUseCase = {
  create,
} as const;
