import { RA } from '@iwasa-kosui/result';

import type { Instant } from '../domain/instant/instant.ts';
import type { BlueskyClient, BlueskyClientError } from '../ports/blueskyClient.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ seenAt: Instant }>;

type Ok = Readonly<{ seenAt: Instant }>;

type Err = BlueskyClientError;

export type MarkBlueskyNotificationsSeenUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  client: Pick<BlueskyClient, 'updateSeen'>;
  now: () => Instant;
}>;

const create = ({ client, now }: Deps): MarkBlueskyNotificationsSeenUseCase => {
  const run = async ({ seenAt }: Input): RA<Ok, Err> => {
    const current = now();
    const clamped = seenAt > current ? current : seenAt;
    const updated = await client.updateSeen(clamped);
    return updated.ok ? RA.ok({ seenAt: clamped }) : RA.err(updated.err);
  };

  return { run };
};

export const MarkBlueskyNotificationsSeenUseCase = {
  create,
} as const;
