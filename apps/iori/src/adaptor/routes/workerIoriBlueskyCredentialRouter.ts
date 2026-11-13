import { Result } from '@iwasa-kosui/result';
import { type Context, Hono } from 'hono';
import z from 'zod/v4';

import type {
  BlueskyAccountSwitchPreview,
  BlueskyAccountSwitchView,
} from '../../domain/blueskyAccountSwitch/blueskyAccountSwitch.ts';
import type { BlueskyCredentialView } from '../../domain/blueskyCredential/blueskyCredential.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import type { UserId } from '../../domain/user/userId.ts';
import type { DeleteBlueskyCredentialUseCase } from '../../useCase/deleteBlueskyCredential.ts';
import type { GetBlueskyAccountSwitchUseCase } from '../../useCase/getBlueskyAccountSwitch.ts';
import type { GetBlueskyCredentialUseCase } from '../../useCase/getBlueskyCredential.ts';
import type { IsDigestOwner } from '../../useCase/isDigestOwner.ts';
import type { PreviewBlueskyAccountSwitchUseCase } from '../../useCase/previewBlueskyAccountSwitch.ts';
import type { RegisterBlueskyCredentialUseCase } from '../../useCase/registerBlueskyCredential.ts';
import type { SwitchBlueskyAccountUseCase } from '../../useCase/switchBlueskyAccount.ts';
import { toIsoString } from '../mastodon/time.ts';
import { handleInternalError } from './helper/mastodonErrors.ts';
import { readRequestBody } from './helper/requestBody.ts';
import { requireSameOriginForCookie } from './helper/sameOrigin.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';

export type WorkerIoriBlueskyCredentialRouterDeps = Readonly<{
  authn: MastodonAuthn;
  getBlueskyCredentialUseCase: GetBlueskyCredentialUseCase;
  registerBlueskyCredentialUseCase: RegisterBlueskyCredentialUseCase;
  deleteBlueskyCredentialUseCase: DeleteBlueskyCredentialUseCase;
  switchBlueskyAccountUseCase: SwitchBlueskyAccountUseCase;
  getBlueskyAccountSwitchUseCase: GetBlueskyAccountSwitchUseCase;
  previewBlueskyAccountSwitchUseCase: PreviewBlueskyAccountSwitchUseCase;
  isDigestOwner: IsDigestOwner;
}>;

export type IoriBlueskyCredentialResponse = Readonly<{
  source: 'settings' | 'secret' | 'none';
  handle: string | null;
  did: string | null;
  chatPermitted: boolean | null;
  verifiedAt: string | null;
  registrable: boolean;
}>;

export type IoriBlueskyAccountSwitchResponse =
  | Readonly<{ state: 'idle' }>
  | Readonly<{
    state: 'purging';
    fromDid: string;
    toDid: string;
    startedAt: string;
    attempts: number;
    lastError: string | null;
    stalled: boolean;
  }>;

const readAccounts = Scope.orThrow('read:accounts');
const writeAccounts = Scope.orThrow('write:accounts');
const invalidToken = { error: 'The access token is invalid' } as const;
const forbidden = { error: 'Forbidden' } as const;

const putBodySchema = z.object({
  identifier: z.string().trim().min(1).max(512),
  appPassword: z.string().min(1).max(512),
  currentPassword: z.string().min(1).max(1024),
});

const switchBodySchema = putBodySchema.extend({
  fromDid: z.string().min(1).max(512),
  toDid: z.string().min(1).max(512),
});

const toSwitchResponse = (view: BlueskyAccountSwitchView): IoriBlueskyAccountSwitchResponse =>
  view.state === 'idle' ? view : { ...view, startedAt: toIsoString(view.startedAt) };

const toPreviewResponse = (preview: BlueskyAccountSwitchPreview) => ({ counts: preview });

const toResponse = (view: BlueskyCredentialView): IoriBlueskyCredentialResponse => ({
  source: view.source,
  handle: view.handle,
  did: view.did,
  chatPermitted: view.chatPermitted,
  verifiedAt: view.verifiedAt === null ? null : toIsoString(view.verifiedAt),
  registrable: view.registrable,
});

export const createWorkerIoriBlueskyCredentialRouter = ({
  authn,
  getBlueskyCredentialUseCase,
  registerBlueskyCredentialUseCase,
  deleteBlueskyCredentialUseCase,
  switchBlueskyAccountUseCase,
  getBlueskyAccountSwitchUseCase,
  previewBlueskyAccountSwitchUseCase,
  isDigestOwner,
}: WorkerIoriBlueskyCredentialRouterDeps): Hono<MastodonAuthEnv> => {
  const ownerOnly = async (c: Context<MastodonAuthEnv>): Promise<UserId | Response> => {
    const userId = getMastodonPrincipal(c)?.userId;
    if (userId === null || userId === undefined) return c.json(invalidToken, 401);
    return await isDigestOwner(userId) ? userId : c.json(forbidden, 403);
  };
  return new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .get('/iori/v1/bluesky/credential', authn.requireUser(readAccounts), async (c) => {
      const owner = await ownerOnly(c);
      if (owner instanceof Response) return owner;
      const view = await getBlueskyCredentialUseCase.run();
      return c.json(toResponse(Result.unsafeUnwrap(view)));
    })
    .put(
      '/iori/v1/bluesky/credential',
      requireSameOriginForCookie,
      authn.requireUser(writeAccounts),
      async (c) => {
        const owner = await ownerOnly(c);
        if (owner instanceof Response) return owner;
        const parsed = putBodySchema.safeParse(await readRequestBody(c));
        if (!parsed.success) return c.json({ error: 'invalid_input' }, 400);
        const registered = await registerBlueskyCredentialUseCase.run({ userId: owner, ...parsed.data });
        if (registered.ok) return c.json(toResponse(registered.val));
        switch (registered.err.type) {
          case 'BlueskyCredentialKeyMissing':
            return c.json({ error: 'credential_key_missing' }, 503);
          case 'InvalidCurrentPassword':
            return c.json({ error: 'invalid_password' }, 403);
          case 'BlueskyLoginFailed':
            return c.json({ error: 'bluesky_login_failed' }, 422);
          case 'BlueskyDidMismatch':
            return c.json({ error: 'did_mismatch', current: registered.err.current, next: registered.err.next }, 409);
          case 'BlueskyAccountSwitchInProgress':
            return c.json({ error: 'switch_in_progress' }, 409);
        }
      },
    )
    .delete(
      '/iori/v1/bluesky/credential',
      requireSameOriginForCookie,
      authn.requireUser(writeAccounts),
      async (c) => {
        const owner = await ownerOnly(c);
        if (owner instanceof Response) return owner;
        const deleted = await deleteBlueskyCredentialUseCase.run();
        if (deleted.ok) return c.json(toResponse(deleted.val));
        switch (deleted.err.type) {
          case 'BlueskyAccountSwitchInProgress':
            return c.json({ error: 'switch_in_progress' }, 409);
          case 'BlueskyEnvAccountDiffers':
            return c.json({ error: 'env_account_differs' }, 409);
        }
      },
    )
    .get('/iori/v1/bluesky/account-switch/preview', authn.requireUser(readAccounts), async (c) => {
      const owner = await ownerOnly(c);
      if (owner instanceof Response) return owner;
      return c.json(toPreviewResponse(Result.unsafeUnwrap(await previewBlueskyAccountSwitchUseCase.run())));
    })
    .get('/iori/v1/bluesky/account-switch', authn.requireUser(readAccounts), async (c) => {
      const owner = await ownerOnly(c);
      if (owner instanceof Response) return owner;
      return c.json(toSwitchResponse(Result.unsafeUnwrap(await getBlueskyAccountSwitchUseCase.run())));
    })
    .post(
      '/iori/v1/bluesky/account-switch',
      requireSameOriginForCookie,
      authn.requireUser(writeAccounts),
      async (c) => {
        const owner = await ownerOnly(c);
        if (owner instanceof Response) return owner;
        const parsed = switchBodySchema.safeParse(await readRequestBody(c));
        if (!parsed.success) return c.json({ error: 'invalid_input' }, 400);
        const switched = await switchBlueskyAccountUseCase.run({ userId: owner, ...parsed.data });
        if (switched.ok) return c.json(toSwitchResponse(switched.val), 202);
        switch (switched.err.type) {
          case 'BlueskyCredentialKeyMissing':
            return c.json({ error: 'credential_key_missing' }, 503);
          case 'InvalidCurrentPassword':
            return c.json({ error: 'invalid_password' }, 403);
          case 'BlueskyLoginFailed':
            return c.json({ error: 'bluesky_login_failed' }, 422);
          case 'BlueskyDidChanged':
            return c.json({ error: 'did_changed' }, 409);
          case 'BlueskyAccountSwitchInProgress':
            return c.json({ error: 'switch_in_progress' }, 409);
        }
      },
    );
};
