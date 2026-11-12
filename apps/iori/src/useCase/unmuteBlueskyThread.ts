import { RA } from '@iwasa-kosui/result';

import type { BlueskyClient, BlueskyClientError } from '../ports/blueskyClient.ts';
import type { BlueskyThreadRootResolver } from '../ports/blueskyThreadRootResolver.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ uri: string }>;

type Ok = Readonly<{ threadMuted: boolean }>;

export type UnmuteBlueskyThreadUseCase = UseCase<Input, Ok, BlueskyClientError>;

type Deps = Readonly<{
  client: Pick<BlueskyClient, 'unmuteThread'>;
  threadRootResolver: BlueskyThreadRootResolver;
}>;

const create = ({ client, threadRootResolver }: Deps): UnmuteBlueskyThreadUseCase => {
  const run = async ({ uri }: Input): RA<Ok, BlueskyClientError> => {
    const root = await threadRootResolver.resolve(uri);
    if (!root.ok) return RA.err(root.err);
    const result = await client.unmuteThread(root.val ?? uri);
    if (!result.ok) return RA.err(result.err);
    return RA.ok({ threadMuted: false });
  };

  return { run };
};

export const UnmuteBlueskyThreadUseCase = {
  create,
} as const;
