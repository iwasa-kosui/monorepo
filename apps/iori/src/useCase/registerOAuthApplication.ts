import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import { ClientId } from '../domain/oauth/ids.ts';
import { OAuthApplication, type OAuthApplicationRegisteredStore } from '../domain/oauth/oauthApplication.ts';
import { RedirectUri } from '../domain/oauth/redirectUri.ts';
import { Scope } from '../domain/oauth/scope.ts';
import { Secret } from '../domain/oauth/secret.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  clientName: string | undefined;
  redirectUris: string | ReadonlyArray<string> | undefined;
  scopes: string | undefined;
  website: string | undefined;
}>;

type Ok = Readonly<{
  application: OAuthApplication;
  clientId: ClientId;
  clientSecret: string;
}>;

export type InvalidApplicationRequestError = Readonly<{
  type: 'InvalidApplicationRequestError';
  message: string;
}>;

const InvalidApplicationRequestError = {
  create: (message: string): InvalidApplicationRequestError => ({
    type: 'InvalidApplicationRequestError',
    message,
  }),
} as const;

export type RegisterOAuthApplicationUseCase = UseCase<Input, Ok, InvalidApplicationRequestError>;

type Deps = Readonly<{
  oauthApplicationRegisteredStore: OAuthApplicationRegisteredStore;
}>;

const create = ({ oauthApplicationRegisteredStore }: Deps): RegisterOAuthApplicationUseCase => {
  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andThen((value) =>
        value.clientName === undefined || value.clientName.trim().length === 0
          ? RA.err(InvalidApplicationRequestError.create('client_name is required'))
          : RA.ok(value)
      ),
      RA.andBind('redirectUris', ({ redirectUris }) => {
        const parsed = RedirectUri.parseList(redirectUris);
        return parsed.ok ? RA.ok(parsed.val) : RA.err(InvalidApplicationRequestError.create(parsed.err.message));
      }),
      RA.andBind('scopes', ({ scopes }) => {
        const parsed = Scope.parseList(scopes);
        return parsed.ok ? RA.ok(parsed.val) : RA.err(InvalidApplicationRequestError.create(parsed.err.message));
      }),
      RA.bind('clientSecret', () => Secret.generate()),
      RA.bind('clientSecretHash', ({ clientSecret }) => Secret.hash(clientSecret)),
      RA.andBind('registered', ({ clientName, website, redirectUris, scopes, clientSecretHash }) => {
        const now = Instant.now();
        const registered = OAuthApplication.register(now)({
          clientId: ClientId.generate(),
          clientSecretHash,
          name: clientName ?? '',
          website: website === undefined || website.length === 0 ? null : website,
          redirectUris: [...redirectUris],
          scopes: [...scopes],
        });
        return registered.ok
          ? RA.ok(registered.val)
          : RA.err(InvalidApplicationRequestError.create('client_name or website is invalid'));
      }),
      RA.andThrough(({ registered }) => oauthApplicationRegisteredStore.store(registered)),
      RA.map(({ registered, clientSecret }): Ok => ({
        application: registered.aggregateState,
        clientId: registered.aggregateState.clientId,
        clientSecret,
      })),
    );

  return { run };
};

export const RegisterOAuthApplicationUseCase = {
  create,
} as const;
