import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { DigestTopicsUnavailableError } from '../../domain/digest/digest.ts';
import { DigestId } from '../../domain/digest/digestId.ts';
import type { DigestRequestReservation } from '../../domain/digest/digestRequestLimit.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { PostId } from '../../domain/post/postId.ts';
import { UserId } from '../../domain/user/userId.ts';
import type { CreateDailyDigestUseCase } from '../createDailyDigest.ts';
import { RequestDigestUseCase } from '../requestDigest.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 4, 21, 30));
const userId = UserId.generate();
const digestId = DigestId.generate();
const postId = PostId.generate();

const created = {
  status: 'created' as const,
  trigger: 'requested' as const,
  digestDate: '2026-11-05',
  digestId,
  postId,
  durationMs: 10,
  topics: 2,
  items: 7,
  trends: 0,
  xPosts: 0,
  summarized: 0,
  recommendation: {
    materials: 0,
    candidates: 0,
    selected: 0,
    scoringMs: 0,
    fetchedBodies: 0,
    fallbackToDescription: 0,
    assignedToTopics: 0,
    belowMinSimilarity: 0,
    belowMinMargin: 0,
    excluded: 0,
  },
};

const setup = (
  options: {
    reservation?: DigestRequestReservation;
    createResult?: ReturnType<CreateDailyDigestUseCase['run']>;
  } = {},
) => {
  const reserve = vi.fn(() => RA.ok(options.reservation ?? { allowed: true as const }));
  const createRun = vi.fn(() => options.createResult ?? RA.ok(created));
  const useCase = RequestDigestUseCase.create({
    digestRequestUsageRecorder: { reserve },
    createDailyDigestUseCase: { run: createRun } as unknown as CreateDailyDigestUseCase,
    now: () => NOW,
  });
  return { useCase, reserve, createRun };
};

describe('RequestDigestUseCase', () => {
  it('回数を予約して、requested の digest を作り、まとめの postId と送った件数を JST の日付つきで返す', async () => {
    const t = setup();

    const result = await t.useCase.run({ userId });

    expect(result).toEqual({
      ok: true,
      val: { digestId, postId, digestDate: '2026-11-05', topics: 2, items: 7 },
    });
    expect(t.reserve).toHaveBeenCalledWith({ userId, day: '2026-11-05', now: NOW });
    expect(t.createRun).toHaveBeenCalledWith({ userId, trigger: 'requested' });
  });

  it.each(['daily_limit', 'too_soon'] as const)(
    '予約を断られたら %s の DigestRequestLimitError を返し、digest を作らない',
    async (reason) => {
      const t = setup({ reservation: { allowed: false, reason, retryAfterSeconds: 42 } });

      const result = await t.useCase.run({ userId });

      expect(result).toMatchObject({
        ok: false,
        err: { type: 'DigestRequestLimitError', reason, retryAfterSeconds: 42 },
      });
      expect(t.createRun).not.toHaveBeenCalled();
    },
  );

  it('作る側が埋め込みのあるトピックが無いと返したら、そのエラーを返す', async () => {
    const t = setup({ createResult: RA.err(DigestTopicsUnavailableError.create()) });

    const result = await t.useCase.run({ userId });

    expect(result).toMatchObject({ ok: false, err: { type: 'DigestTopicsUnavailableError' } });
  });
});
