import type { RA } from '@iwasa-kosui/result';

import type { BlueskyModerationState } from '../domain/blueskyModeration/blueskyModeration.ts';
import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import type { BlueskyModerationReader } from '../ports/blueskyModerationReader.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ did: string }>;

export type GetBlueskyModerationStateUseCase = UseCase<Input, BlueskyModerationState, BlueskyClientError>;

type Deps = Readonly<{
  reader: BlueskyModerationReader;
}>;

const create = ({ reader }: Deps): GetBlueskyModerationStateUseCase => ({
  run: ({ did }: Input): RA<BlueskyModerationState, BlueskyClientError> => reader.resolveViewerState(did),
});

export const GetBlueskyModerationStateUseCase = {
  create,
} as const;
