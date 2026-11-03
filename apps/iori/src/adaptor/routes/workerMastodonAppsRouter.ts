import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';

import type { OAuthApplication, OAuthApplicationResolver } from '../../domain/oauth/oauthApplication.ts';
import type { RegisterOAuthApplicationUseCase } from '../../useCase/registerOAuthApplication.ts';
import { bodyString, readRequestBody } from './helper/requestBody.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';

export type WorkerMastodonAppsRouterDeps = Readonly<{
  registerOAuthApplicationUseCase: RegisterOAuthApplicationUseCase;
  oauthApplicationResolver: OAuthApplicationResolver;
  authn: MastodonAuthn;
}>;

const toApplicationJson = (application: OAuthApplication) => ({
  id: application.id,
  name: application.name,
  website: application.website,
  scopes: [...application.scopes],
  redirect_uris: [...application.redirectUris],
  redirect_uri: application.redirectUris.join('\n'),
});

export const createWorkerMastodonAppsRouter = ({
  registerOAuthApplicationUseCase,
  oauthApplicationResolver,
  authn,
}: WorkerMastodonAppsRouterDeps): Hono<MastodonAuthEnv> =>
  new Hono<MastodonAuthEnv>()
    .post('/v1/apps', async (c) => {
      const body = await readRequestBody(c);
      return RA.flow(
        registerOAuthApplicationUseCase.run({
          clientName: bodyString(body, 'client_name'),
          redirectUris: (body['redirect_uris'] ?? body['redirect_uris[]']) as string | readonly string[] | undefined,
          scopes: bodyString(body, 'scopes'),
          website: bodyString(body, 'website'),
        }),
        RA.match({
          ok: ({ application, clientId, clientSecret }) =>
            c.json({
              ...toApplicationJson(application),
              client_id: clientId,
              client_secret: clientSecret,
              client_secret_expires_at: 0,
            }),
          err: (error) => c.json({ error: error.message }, 422),
        }),
      );
    })
    .get('/v1/apps/verify_credentials', authn.requireApp, async (c) => {
      const applicationId = getMastodonPrincipal(c)?.applicationId ?? null;
      if (applicationId === null) {
        return c.json({ error: 'The access token is invalid' }, 401);
      }
      const resolved = await oauthApplicationResolver.resolve(applicationId);
      if (!resolved.ok || resolved.val === undefined) {
        return c.json({ error: 'The access token is invalid' }, 401);
      }
      return c.json(toApplicationJson(resolved.val));
    });
