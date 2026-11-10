import type { RA } from '@iwasa-kosui/result';

import type { BlueskyClientError } from './blueskyClient.ts';

export type BlueskyViewerRepostResolver = Readonly<{
  resolve: (postUri: string) => RA<string | null, BlueskyClientError>;
}>;
