import { RA } from '@iwasa-kosui/result';

import type { BlueskyClient, BlueskyClientError } from '../ports/blueskyClient.ts';
import type { BlueskyThreadRootResolver } from '../ports/blueskyThreadRootResolver.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ uri: string }>;

type Ok = Readonly<{ threadMuted: boolean }>;

export type BlueskyThreadTargetNotFound = Readonly<{ type: 'BlueskyThreadTargetNotFound' }>;

type Err = BlueskyClientError | BlueskyThreadTargetNotFound;

export type MuteBlueskyThreadUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  client: Pick<BlueskyClient, 'muteThread'>;
  threadRootResolver: BlueskyThreadRootResolver;
}>;

const create = ({ client, threadRootResolver }: Deps): MuteBlueskyThreadUseCase => {
  const run = async ({ uri }: Input): RA<Ok, Err> => {
    const root = await threadRootResolver.resolve(uri);
    if (!root.ok) return RA.err(root.err);
    if (root.val === undefined) return RA.err({ type: 'BlueskyThreadTargetNotFound' });
    const result = await client.muteThread(root.val);
    if (!result.ok) return RA.err(result.err);
    return RA.ok({ threadMuted: true });
  };

  return { run };
};

export const MuteBlueskyThreadUseCase = {
  create,
} as const;
