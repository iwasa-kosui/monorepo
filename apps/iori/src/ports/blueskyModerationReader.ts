import type { RA } from '@iwasa-kosui/result';

import type { BlueskyModerationState } from '../domain/blueskyModeration/blueskyModeration.ts';
import type { BlueskyClientError } from './blueskyClient.ts';

export type BlueskyModerationReader = Readonly<{
  resolveViewerState: (did: string) => RA<BlueskyModerationState, BlueskyClientError>;
  hasBlockRecord: (blockUri: string) => RA<boolean, BlueskyClientError>;
}>;
