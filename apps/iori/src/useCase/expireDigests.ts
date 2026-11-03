import { RA } from '@iwasa-kosui/result';

import {
  Digest,
  type DigestExpiredStore,
  type DigestHeadersResolverByDigestDateBefore,
} from '../domain/digest/digest.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { UseCase } from './useCase.ts';

export const DIGEST_RETENTION_DAYS = 365;
const EXPIRE_BATCH_SIZE = 25;
const EXPIRE_MAX_BATCHES = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

type Input = void;

type Ok = Readonly<{ expired: number }>;

type Err = never;

export type ExpireDigestsUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  digestHeadersResolverByDigestDateBefore: DigestHeadersResolverByDigestDateBefore;
  digestExpiredStore: DigestExpiredStore;
  now: () => Instant;
}>;

const create = ({
  digestHeadersResolverByDigestDateBefore,
  digestExpiredStore,
  now,
}: Deps): ExpireDigestsUseCase => {
  const run = async () => {
    const timestamp = now();
    const digestDateBefore = Instant.toJstDate(Instant.addDuration(timestamp, -DIGEST_RETENTION_DAYS * DAY_MS));
    let expired = 0;
    for (let batch = 0; batch < EXPIRE_MAX_BATCHES; batch += 1) {
      const headers = await digestHeadersResolverByDigestDateBefore.resolve({
        digestDateBefore,
        limit: EXPIRE_BATCH_SIZE,
      });
      if (headers.val.length === 0) break;
      await digestExpiredStore.store(...headers.val.map((header) => Digest.expire(header, timestamp)));
      expired += headers.val.length;
      if (headers.val.length < EXPIRE_BATCH_SIZE) break;
    }
    return RA.ok({ expired });
  };

  return { run };
};

export const ExpireDigestsUseCase = {
  create,
} as const;
