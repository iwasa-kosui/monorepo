import { RA } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import type {
  DigestExpiredStore,
  DigestHeader,
  DigestHeadersResolverByDigestDateBefore,
} from '../../domain/digest/digest.ts';
import { DigestId } from '../../domain/digest/digestId.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { PostId } from '../../domain/post/postId.ts';
import { UserId } from '../../domain/user/userId.ts';
import { ExpireDigestsUseCase } from '../expireDigests.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 5, 0, 0));
const userId = UserId.generate();

const setup = () => {
  let headers: DigestHeader[] = [];
  const expiredEvents: string[] = [];
  const digestHeadersResolverByDigestDateBefore: DigestHeadersResolverByDigestDateBefore = {
    resolve: ({ digestDateBefore, limit }) =>
      RA.ok(headers.filter((header) => header.digestDate < digestDateBefore).slice(0, limit)),
  };
  const digestExpiredStore: DigestExpiredStore = {
    store: (...events) => {
      const expiredIds = new Set(events.map((event) => event.eventPayload.digestId));
      headers = headers.filter((header) => !expiredIds.has(header.digestId));
      expiredEvents.push(...events.map((event) => event.eventName));
      return RA.ok(undefined);
    },
  };
  const addDigest = (digestDate: string) => {
    const digestId = DigestId.generate();
    headers.push({
      digestId,
      userId,
      digestDate,
      postId: PostId.generate(),
      xPostsPostId: null,
      createdAt: Instant.orThrow(1),
      trigger: 'scheduled',
      topicKey: 'summary',
    });
    return digestId;
  };
  const useCase = ExpireDigestsUseCase.create({
    digestHeadersResolverByDigestDateBefore,
    digestExpiredStore,
    now: () => NOW,
  });
  return { addDigest, useCase, remaining: () => headers.map((header) => header.digestId), expiredEvents };
};

describe('ExpireDigestsUseCase', () => {
  it('365 日より前の digest だけを消し、digest.expired を記録する', async () => {
    const t = setup();
    t.addDigest('2025-11-03');
    t.addDigest('2025-11-04');
    const boundary = t.addDigest('2025-11-05');
    const recent = t.addDigest('2026-11-04');

    const result = await t.useCase.run();

    expect(result).toMatchObject({ ok: true, val: { expired: 2 } });
    expect(t.remaining()).toEqual([boundary, recent]);
    expect(t.expiredEvents).toEqual(['digest.expired', 'digest.expired']);
  });

  it('消すものが無ければ何もしない', async () => {
    const t = setup();
    const recent = t.addDigest('2026-11-04');

    const result = await t.useCase.run();

    expect(result).toMatchObject({ ok: true, val: { expired: 0 } });
    expect(t.remaining()).toEqual([recent]);
    expect(t.expiredEvents).toEqual([]);
  });

  it('1 回の取得件数より多い digest も、続けて消す', async () => {
    const t = setup();
    for (let day = 1; day <= 30; day += 1) t.addDigest(`2025-01-${String(day).padStart(2, '0')}`);
    const recent = t.addDigest('2026-11-04');

    const result = await t.useCase.run();

    expect(result).toMatchObject({ ok: true, val: { expired: 30 } });
    expect(t.remaining()).toEqual([recent]);
  });
});
