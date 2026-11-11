import type { RA } from '@iwasa-kosui/result';

import type { BlueskyClientError } from './blueskyClient.ts';

export type BlueskyMutedActorsFetcher = Readonly<{
  fetch: () => RA<readonly string[], BlueskyClientError>;
}>;
