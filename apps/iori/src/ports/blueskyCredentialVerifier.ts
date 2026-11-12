import type { RA } from '@iwasa-kosui/result';

import type { BlueskySession } from '../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { BlueskyClientError, BlueskyCredentials } from './blueskyClient.ts';

export type BlueskyCredentialVerifier = Readonly<{
  login: (credentials: BlueskyCredentials) => RA<BlueskySession, BlueskyClientError>;
  probeChat: (session: BlueskySession) => Promise<boolean | null>;
}>;
