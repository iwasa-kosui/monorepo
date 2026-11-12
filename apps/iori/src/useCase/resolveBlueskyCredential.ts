import type {
  BlueskyStoredCredential,
  BlueskyStoredCredentialResolver,
} from '../domain/blueskyCredential/blueskyCredential.ts';
import type { BlueskyCredentials } from '../ports/blueskyClient.ts';
import type { SecretCipher } from '../ports/secretCipher.ts';

export type BlueskyCredentialResolution =
  | Readonly<{ source: 'settings'; credentials: BlueskyCredentials; stored: BlueskyStoredCredential }>
  | Readonly<{ source: 'secret'; credentials: BlueskyCredentials }>
  | Readonly<{ source: 'none'; credentials: undefined }>;

export type ResolveBlueskyCredentialUseCase = Readonly<{
  run: () => Promise<BlueskyCredentialResolution>;
}>;

type Deps = Readonly<{
  storedResolver: BlueskyStoredCredentialResolver;
  cipher: SecretCipher | undefined;
  envCredentials: BlueskyCredentials | undefined;
  onDecryptFailed: () => void;
}>;

const create = ({ storedResolver, cipher, envCredentials, onDecryptFailed }: Deps): ResolveBlueskyCredentialUseCase => {
  const fromSettings = async (): Promise<BlueskyCredentialResolution | undefined> => {
    if (cipher === undefined) return undefined;
    const stored = await storedResolver.resolve();
    if (!stored.ok || stored.val === undefined) return undefined;
    const appPassword = await cipher.decrypt({
      ciphertext: stored.val.appPasswordCiphertext,
      iv: stored.val.appPasswordIv,
    });
    if (appPassword === undefined) {
      onDecryptFailed();
      return undefined;
    }
    return {
      source: 'settings',
      credentials: { identifier: stored.val.identifier, appPassword },
      stored: stored.val,
    };
  };

  const run = async (): Promise<BlueskyCredentialResolution> => {
    const settings = await fromSettings();
    if (settings !== undefined) return settings;
    return envCredentials === undefined
      ? { source: 'none', credentials: undefined }
      : { source: 'secret', credentials: envCredentials };
  };

  return { run };
};

export const ResolveBlueskyCredentialUseCase = { create } as const;
