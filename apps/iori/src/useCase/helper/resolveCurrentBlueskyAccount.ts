import type { BlueskyStoredCredentialResolver } from '../../domain/blueskyCredential/blueskyCredential.ts';
import type { BlueskySession, BlueskySessionResolver } from '../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { BlueskyCredentials } from '../../ports/blueskyClient.ts';
import type { BlueskyCredentialVerifier } from '../../ports/blueskyCredentialVerifier.ts';

export type CurrentBlueskyAccount = Readonly<{ did: string; handle: string | null }>;

type Deps = Readonly<{
  storedResolver: BlueskyStoredCredentialResolver;
  sessionResolver: BlueskySessionResolver;
  envCredentials: BlueskyCredentials | undefined;
  verifier: BlueskyCredentialVerifier;
}>;

export const resolveCurrentBlueskyAccount = async (
  { storedResolver, sessionResolver, envCredentials, verifier }: Deps,
): Promise<Readonly<{ current: CurrentBlueskyAccount | undefined; envSession: BlueskySession | undefined }>> => {
  const stored = await storedResolver.resolve();
  const currentSession = await sessionResolver.resolve();
  const known: CurrentBlueskyAccount | undefined = stored.ok && stored.val !== undefined
    ? { did: stored.val.did, handle: stored.val.handle }
    : currentSession.ok && currentSession.val !== undefined
    ? { did: currentSession.val.did, handle: currentSession.val.handle }
    : undefined;
  const envLogin = known === undefined && envCredentials !== undefined
    ? await verifier.login(envCredentials)
    : undefined;
  const envSession = envLogin?.ok ? envLogin.val : undefined;
  return {
    current: known ?? (envSession === undefined ? undefined : { did: envSession.did, handle: envSession.handle }),
    envSession,
  };
};
