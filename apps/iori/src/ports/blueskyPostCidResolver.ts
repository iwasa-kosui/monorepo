import type { RA } from '@iwasa-kosui/result';

import type { BlueskyClientError } from './blueskyClient.ts';

export type BlueskyPostCidResolver = Readonly<{
  resolve: (postUri: string) => RA<string | undefined, BlueskyClientError>;
}>;
