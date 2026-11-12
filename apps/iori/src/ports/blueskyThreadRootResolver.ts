import type { RA } from '@iwasa-kosui/result';

import type { BlueskyClientError } from './blueskyClient.ts';

export type BlueskyThreadRootResolver = Readonly<{
  resolve: (postUri: string) => RA<string | undefined, BlueskyClientError>;
}>;
