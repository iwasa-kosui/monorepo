import { RA } from '@iwasa-kosui/result';

import type { ArticleResolver } from '../domain/article/article.ts';
import type { ArticleId } from '../domain/article/articleId.ts';
import {
  DigestAlreadyPublishedError,
  type DigestHeaderResolverByUserIdAndDigestDate,
} from '../domain/digest/digest.ts';
import type { DigestId } from '../domain/digest/digestId.ts';
import type { DigestRequestUsageRecorder } from '../domain/digest/digestRequestLimit.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { CreateDailyDigestUseCase } from './createDailyDigest.ts';
import type { InferUseCaseError, UseCase } from './useCase.ts';

type Input = Readonly<{ userId: UserId }>;

type Ok = Readonly<{
  digestId: DigestId;
  articleId: ArticleId;
  digestDate: string;
  replaced: boolean;
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
  digestHeaderResolverByUserIdAndDigestDate: DigestHeaderResolverByUserIdAndDigestDate;
  articleResolver: ArticleResolver;
  digestRequestUsageRecorder: DigestRequestUsageRecorder;
  createDailyDigestUseCase: CreateDailyDigestUseCase;
  now: () => Instant;
}>;

const create = ({
  digestHeaderResolverByUserIdAndDigestDate,
  articleResolver,
  digestRequestUsageRecorder,
  createDailyDigestUseCase,
  now,
}: Deps): RequestDigestUseCase => {
  const run = async ({ userId }: Input) => {
    const requestedAt = now();
    const digestDate = Instant.toJstDate(requestedAt);

    const existing = await digestHeaderResolverByUserIdAndDigestDate.resolve({ userId, digestDate });
    if (existing.val !== undefined) {
      const article = await articleResolver.resolve(existing.val.articleId);
      if (article.val !== undefined && article.val.status !== 'draft') {
        return RA.err(DigestAlreadyPublishedError.create(digestDate));
      }
    }

    const reservation = await digestRequestUsageRecorder.reserve({ userId, day: digestDate, now: requestedAt });
    if (!reservation.val.allowed) {
      return RA.err(DigestRequestLimitError.create(reservation.val.reason, reservation.val.retryAfterSeconds));
    }

    const created = await createDailyDigestUseCase.run({ userId, trigger: 'requested' });
    if (!created.ok) return created;
    const { digestId, articleId, replaced } = created.val;
    if (digestId === undefined || articleId === undefined) {
      throw new Error('A requested digest must not be skipped.');
    }
    return RA.ok({ digestId, articleId, digestDate, replaced });
  };

  return { run };
};

export const RequestDigestUseCase = {
  create,
} as const;
