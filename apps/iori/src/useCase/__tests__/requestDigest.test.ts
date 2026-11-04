import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { Article } from '../../domain/article/article.ts';
import { ArticleId } from '../../domain/article/articleId.ts';
import type { DigestHeader } from '../../domain/digest/digest.ts';
import { DigestId } from '../../domain/digest/digestId.ts';
import type { DigestRequestReservation } from '../../domain/digest/digestRequestLimit.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { UserId } from '../../domain/user/userId.ts';
import type { CreateDailyDigestUseCase } from '../createDailyDigest.ts';
import { RequestDigestUseCase } from '../requestDigest.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 4, 21, 30));
const userId = UserId.generate();
const articleId = ArticleId.generate();
const digestId = DigestId.generate();

const header: DigestHeader = {
  digestId,
  userId,
  digestDate: '2026-11-05',
  articleId,
  createdAt: NOW,
  pushSentAt: null,
  trigger: 'scheduled',
};

const setup = (
  options: {
    existing?: DigestHeader;
    status?: Article['status'];
    reservation?: DigestRequestReservation;
    articleMissing?: boolean;
  } = {},
) => {
  const reserve = vi.fn(() => RA.ok(options.reservation ?? { allowed: true as const }));
  const createRun = vi.fn(() =>
    RA.ok({
      status: 'created' as const,
      trigger: 'requested' as const,
      digestDate: '2026-11-05',
      digestId,
      articleId,
      replaced: options.existing !== undefined,
      durationMs: 10,
      items: 0,
      trends: 0,
      summarized: 0,
      pushed: 0,
      recommendation: {
        materials: 0,
        candidates: 0,
        selected: 0,
        scoringMs: 0,
        fetchedBodies: 0,
        fallbackToDescription: 0,
      },
    })
  );
  const resolveHeader = vi.fn(() => RA.ok(options.existing));
  const useCase = RequestDigestUseCase.create({
    digestHeaderResolverByUserIdAndDigestDate: { resolve: resolveHeader },
    articleResolver: {
      resolve: () =>
        RA.ok(
          options.existing === undefined || options.articleMissing === true
            ? undefined
            : { status: options.status ?? 'draft' } as Article,
        ),
    },
    digestRequestUsageRecorder: { reserve },
    createDailyDigestUseCase: { run: createRun } as CreateDailyDigestUseCase,
    now: () => NOW,
  });
  return { useCase, reserve, createRun, resolveHeader };
};

describe('RequestDigestUseCase', () => {
  it('回数を予約して、trigger を requested にして digest を作り、JST の日付を返す', async () => {
    const t = setup();

    const result = await t.useCase.run({ userId });

    expect(result).toEqual({ ok: true, val: { digestId, articleId, digestDate: '2026-11-05', replaced: false } });
    expect(t.resolveHeader).toHaveBeenCalledWith({ userId, digestDate: '2026-11-05' });
    expect(t.reserve).toHaveBeenCalledWith({ userId, day: '2026-11-05', now: NOW });
    expect(t.createRun).toHaveBeenCalledWith({ userId, trigger: 'requested' });
  });

  it('その日の draft の digest があれば予約して作り直し、replaced を true にする', async () => {
    const t = setup({ existing: header, status: 'draft' });

    const result = await t.useCase.run({ userId });

    expect(result).toMatchObject({ ok: true, val: { replaced: true } });
    expect(t.reserve).toHaveBeenCalledTimes(1);
  });

  it.each(['published', 'unpublished'] as const)(
    'その日の digest の article が %s なら、予約せずに DigestAlreadyPublishedError を返す',
    async (status) => {
      const t = setup({ existing: header, status });

      const result = await t.useCase.run({ userId });

      expect(result).toMatchObject({
        ok: false,
        err: { type: 'DigestAlreadyPublishedError', detail: { digestDate: '2026-11-05' } },
      });
      expect(t.reserve).not.toHaveBeenCalled();
      expect(t.createRun).not.toHaveBeenCalled();
    },
  );

  it('その日の digest の article が見つからなければ、予約せずに ArticleNotFoundError を返す', async () => {
    const t = setup({ existing: header, articleMissing: true });

    const result = await t.useCase.run({ userId });

    expect(result).toMatchObject({ ok: false, err: { type: 'ArticleNotFoundError' } });
    expect(t.reserve).not.toHaveBeenCalled();
    expect(t.createRun).not.toHaveBeenCalled();
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

  it('digest の作成が失敗したらそのエラーを返す', async () => {
    const t = setup();
    t.createRun.mockReturnValueOnce(RA.err({ type: 'UserNotFoundError', message: 'x' }) as never);

    const result = await t.useCase.run({ userId });

    expect(result).toMatchObject({ ok: false, err: { type: 'UserNotFoundError' } });
  });
});
