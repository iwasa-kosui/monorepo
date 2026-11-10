import { RA } from '@iwasa-kosui/result';

import { ClientId } from '../../domain/oauth/ids.ts';
import type { OAuthApplication, OAuthApplicationResolverByClientId } from '../../domain/oauth/oauthApplication.ts';
import { OAuthError } from '../../domain/oauth/oauthError.ts';
import { Secret } from '../../domain/oauth/secret.ts';

export type OAuthClientCredentials = Readonly<{
  clientId: string | undefined;
  clientSecret: string | undefined;
}>;

export const authenticateOAuthClientWith =
  (resolver: OAuthApplicationResolverByClientId) =>
  (credentials: OAuthClientCredentials): RA<OAuthApplication, OAuthError> => {
    const invalid = () => RA.err(OAuthError.create('invalid_client', 'Client authentication failed.'));
    const { clientId, clientSecret } = credentials;
    if (clientId === undefined || clientSecret === undefined || clientSecret.length === 0) {
      return invalid();
    }
    const parsed = ClientId.parse(clientId);
    if (!parsed.ok) {
      return invalid();
    }
    return RA.flow(
      resolver.resolve(parsed.val),
      RA.andThen(async (application) => {
        if (application === undefined || !(await Secret.matches(clientSecret, application.clientSecretHash))) {
          return invalid();
        }
        return RA.ok(application);
      }),
    );
  };
