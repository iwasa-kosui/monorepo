import type { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import type { BlueskyAccountSwitchInProgress } from '../blueskyAccountSwitch/blueskyAccountSwitch.ts';
import type { BlueskySession } from '../blueskyCrosspost/blueskyCrosspost.ts';
import { Instant } from '../instant/instant.ts';
import type { UserId } from '../user/userId.ts';

export const BLUESKY_CREDENTIAL_KEY_VERSION = 1;
export const blueskyCredentialAad = (did: string): string => `bluesky_credentials:default:v1:${did}`;

const blueskyStoredCredentialZodType = z.object({
  identifier: z.string().min(1),
  did: z.string().min(1),
  handle: z.string().min(1),
  appPasswordCiphertext: z.string().min(1),
  appPasswordIv: z.string().min(1),
  keyVersion: z.number().int().positive(),
  chatPermitted: z.boolean().nullable(),
  verifiedAt: Instant.zodType,
  updatedAt: Instant.zodType,
});

export type BlueskyStoredCredential = z.infer<typeof blueskyStoredCredentialZodType>;
export const BlueskyStoredCredential = Schema.create(blueskyStoredCredentialZodType);

export type BlueskyStoredCredentialResolver = Readonly<{
  resolve: () => RA<BlueskyStoredCredential | undefined, never>;
}>;
/** その DID のアカウントをつないでいるユーザー。1 つのアカウントは 1 人のユーザーにしかつながない */
export type BlueskyCredentialUserIdResolverByDid = Readonly<{
  resolve: (did: string) => RA<UserId | undefined, never>;
}>;

export type BlueskyAccountLinkedElsewhere = Readonly<{
  type: 'BlueskyAccountLinkedElsewhere';
  message: string;
}>;
export const BlueskyAccountLinkedElsewhere = {
  create: (): BlueskyAccountLinkedElsewhere => ({
    type: 'BlueskyAccountLinkedElsewhere',
    message: 'The Bluesky account is linked to another user.',
  }),
} as const;

export type BlueskyStoredCredentialSavedStore = Readonly<{
  save: (credential: BlueskyStoredCredential) => RA<void, never>;
}>;
export type BlueskyStoredCredentialDeletedStore = Readonly<{
  delete: () => RA<void, never>;
}>;

export type BlueskyCredentialRegisteredStore = Readonly<{
  store: (
    registered: Readonly<{ credential: BlueskyStoredCredential; session: BlueskySession }>,
  ) => RA<void, BlueskyAccountSwitchInProgress>;
}>;
export type BlueskyCredentialRemovedStore = Readonly<{
  delete: () => RA<void, BlueskyAccountSwitchInProgress>;
}>;

export type BlueskyCredentialSource = 'settings' | 'secret' | 'none';

export type BlueskyCredentialView = Readonly<{
  source: BlueskyCredentialSource;
  handle: string | null;
  did: string | null;
  chatPermitted: boolean | null;
  verifiedAt: Instant | null;
  registrable: boolean;
}>;
