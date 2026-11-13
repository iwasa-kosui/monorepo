import { Hono } from 'hono';
import z from 'zod/v4';

import { Scope } from '../../domain/oauth/scope.ts';
import {
  DefaultPostVisibility,
  type UserPreferences,
  type UserPreferencesResolverByUserId,
} from '../../domain/userPreferences/userPreferences.ts';
import type { SaveUserPreferencesUseCase } from '../../useCase/saveUserPreferences.ts';
import { handleInternalError, internalServerError } from './helper/mastodonErrors.ts';
import { readRequestBody } from './helper/requestBody.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';

export type WorkerIoriPreferencesRouterDeps = Readonly<{
  authn: MastodonAuthn;
  userPreferencesResolverByUserId: UserPreferencesResolverByUserId;
  saveUserPreferencesUseCase: SaveUserPreferencesUseCase;
}>;

export type IoriPreferencesResponse = Readonly<{
  preferences: Readonly<{ defaultPostVisibility: DefaultPostVisibility }>;
}>;

const readAccounts = Scope.orThrow('read:accounts');
const writeAccounts = Scope.orThrow('write:accounts');
const invalidToken = { error: 'The access token is invalid' } as const;

const putBodySchema = z.object({ defaultPostVisibility: DefaultPostVisibility.zodType });

const toBody = (preferences: Pick<UserPreferences, 'defaultPostVisibility'> | undefined) =>
  ({
    preferences: { defaultPostVisibility: preferences?.defaultPostVisibility ?? DefaultPostVisibility.fallback },
  }) satisfies IoriPreferencesResponse;

export const createWorkerIoriPreferencesRouter = ({
  authn,
  userPreferencesResolverByUserId,
  saveUserPreferencesUseCase,
}: WorkerIoriPreferencesRouterDeps): Hono<MastodonAuthEnv> =>
  new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .get('/iori/v1/preferences', authn.requireUser(readAccounts), async (c) => {
      const userId = getMastodonPrincipal(c)?.userId ?? undefined;
      if (userId === undefined) return c.json(invalidToken, 401);
      const preferences = await userPreferencesResolverByUserId.resolve(userId);
      return preferences.ok ? c.json(toBody(preferences.val)) : c.json(internalServerError, 500);
    })
    .put('/iori/v1/preferences', authn.requireUser(writeAccounts), async (c) => {
      const userId = getMastodonPrincipal(c)?.userId ?? undefined;
      if (userId === undefined) return c.json(invalidToken, 401);
      const body = putBodySchema.safeParse(await readRequestBody(c));
      if (!body.success) return c.json({ error: 'Validation failed: defaultPostVisibility' }, 422);
      const saved = await saveUserPreferencesUseCase.run({ userId, ...body.data });
      return saved.ok ? c.json(toBody(saved.val)) : c.json(internalServerError, 500);
    });
