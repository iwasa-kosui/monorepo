import type { SecretCipher } from './secretCipher.ts';

export type BlueskyCredentialCipherFactory = (did: string) => SecretCipher;
