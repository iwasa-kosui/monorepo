import { RA } from '@iwasa-kosui/result';

import type { DigestId } from '../domain/digest/digestId.ts';
import type { DigestRequestUsageRecorder } from '../domain/digest/digestRequestLimit.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { PostId } from '../domain/post/postId.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { CreateDailyDigestUseCase } from './createDailyDigest.ts';
import type { InferUseCaseError, UseCase } from './useCase.ts';

type Input = Readonly<{ userId: UserId }>;

type Ok = Readonly<{
  digestId: DigestId;
  postId: PostId;
  digestDate: string;
  topics: number;
  items: number;
}>;

export type DigestRequestLimitError = Readonly<{
  type: 'DigestRequestLimitError';
  message: string;
  reason: 'daily_limit' | 'too_soon';
  retryAfterSeconds: number;
}>;

export const DigestRequestLimitError = {
  create: (reason: 'daily_limit' | 'too_soon', retryAfterSeconds: number): DigestRequestLimitError => ({
    type: 'DigestRequestLimitError',
    message: reason === 'daily_limit'
      ? 'The daily digest request limit has been reached.'
      : 'The digest was requested too soon after the previous request.',
    reason,
    retryAfterSeconds,
  }),
} as const;

type Err = DigestRequestLimitError | InferUseCaseError<CreateDailyDigestUseCase>;

export type RequestDigestUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  digestRequestUsageRecorder: DigestRequestUsageRecorder;
  createDailyDigestUseCase: CreateDailyDigestUseCase;
  now: () => Instant;
}>;

const create = ({
  digestRequestUsageRecorder,
  createDailyDigestUseCase,
  now,
}: Deps): RequestDigestUseCase => {
  const run = async ({ userId }: Input) => {
    const requestedAt = now();
    const digestDate = Instant.toJstDate(requestedAt);

    const reservation = await digestRequestUsageRecorder.reserve({ userId, day: digestDate, now: requestedAt });
    if (!reservation.val.allowed) {
      return RA.err(DigestRequestLimitError.create(reservation.val.reason, reservation.val.retryAfterSeconds));
    }

    const created = await createDailyDigestUseCase.run({ userId, trigger: 'requested' });
    if (!created.ok) return created;
    const { digestId, postId, topics, items } = created.val;
    if (digestId === undefined || postId === undefined) {
      throw new Error('A requested digest must not be skipped.');
    }
    return RA.ok({ digestId, postId, digestDate, topics, items });
  };

  return { run };
};

export const RequestDigestUseCase = {
  create,
} as const;
