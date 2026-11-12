import { RA } from '@iwasa-kosui/result';

import type { BlueskyClient, BlueskyClientError } from '../ports/blueskyClient.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ root: string }>;

type Ok = Readonly<{ threadMuted: boolean }>;

export type UnmuteBlueskyThreadUseCase = UseCase<Input, Ok, BlueskyClientError>;

type Deps = Readonly<{
  client: Pick<BlueskyClient, 'unmuteThread'>;
}>;

const create = ({ client }: Deps): UnmuteBlueskyThreadUseCase => {
  const run = async ({ root }: Input): RA<Ok, BlueskyClientError> => {
    const result = await client.unmuteThread(root);
    if (!result.ok) return RA.err(result.err);
    return RA.ok({ threadMuted: false });
  };

  return { run };
};

export const UnmuteBlueskyThreadUseCase = {
  create,
} as const;
