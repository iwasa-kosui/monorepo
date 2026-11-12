import { RA } from '@iwasa-kosui/result';

import type { BlueskyClient, BlueskyClientError } from '../ports/blueskyClient.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ root: string }>;

type Ok = Readonly<{ threadMuted: boolean }>;

export type MuteBlueskyThreadUseCase = UseCase<Input, Ok, BlueskyClientError>;

type Deps = Readonly<{
  client: Pick<BlueskyClient, 'muteThread'>;
}>;

const create = ({ client }: Deps): MuteBlueskyThreadUseCase => {
  const run = async ({ root }: Input): RA<Ok, BlueskyClientError> => {
    const result = await client.muteThread(root);
    if (!result.ok) return RA.err(result.err);
    return RA.ok({ threadMuted: true });
  };

  return { run };
};

export const MuteBlueskyThreadUseCase = {
  create,
} as const;
