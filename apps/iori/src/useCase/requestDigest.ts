import { RA } from '@iwasa-kosui/result';

import { ArticleNotFoundError, type ArticleResolver } from '../domain/article/article.ts';
import type { ArticleId } from '../domain/article/articleId.ts';
import type { ArticleBodyResolver } from '../domain/articleBody/articleBody.ts';
import {
  DigestAlreadyPublishedError,
  DigestDraftEditedError,
  type DigestHeadersResolverByUserIdAndDigestDate,
} from '../domain/digest/digest.ts';
import type { DigestId } from '../domain/digest/digestId.ts';
import type { DigestRequestUsageRecorder } from '../domain/digest/digestRequestLimit.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { CreateDailyDigestUseCase } from './createDailyDigest.ts';
import { resolveReplaceableDigests } from './helper/resolveReplaceableDigests.ts';
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
  digestHeadersResolverByUserIdAndDigestDate: DigestHeadersResolverByUserIdAndDigestDate;
  articleResolver: ArticleResolver;
  articleBodyResolver: ArticleBodyResolver;
  digestRequestUsageRecorder: DigestRequestUsageRecorder;
  createDailyDigestUseCase: CreateDailyDigestUseCase;
  now: () => Instant;
}>;

const create = ({
  digestHeadersResolverByUserIdAndDigestDate,
  articleResolver,
  articleBodyResolver,
  digestRequestUsageRecorder,
  createDailyDigestUseCase,
  now,
}: Deps): RequestDigestUseCase => {
  const run = async ({ userId }: Input) => {
    const requestedAt = now();
    const digestDate = Instant.toJstDate(requestedAt);

    const replaceable = await resolveReplaceableDigests(
      { digestHeadersResolverByUserIdAndDigestDate, articleResolver, articleBodyResolver },
      { userId, digestDate },
    );
    if (replaceable.missingArticleId !== undefined) {
      return RA.err(ArticleNotFoundError.create(replaceable.missingArticleId));
    }
    if (replaceable.blockedBy === 'edited') return RA.err(DigestDraftEditedError.create(digestDate));
    if (replaceable.blockedBy === 'published') return RA.err(DigestAlreadyPublishedError.create(digestDate));

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
