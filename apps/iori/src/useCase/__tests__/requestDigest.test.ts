import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { Article } from '../../domain/article/article.ts';
import { ArticleId } from '../../domain/article/articleId.ts';
import type { ArticleBody } from '../../domain/articleBody/articleBody.ts';
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
  topicKey: 'summary',
};

type ExistingDigest = Readonly<{
  header: DigestHeader;
  status?: Article['status'];
  edited?: boolean;
  articleMissing?: boolean;
}>;

const existingDigest = (topicKey: string, options: Omit<ExistingDigest, 'header'> = {}): ExistingDigest => ({
  header: { ...header, digestId: DigestId.generate(), articleId: ArticleId.generate(), topicKey },
  ...options,
});

const setup = (
  options: {
    existing?: ReadonlyArray<ExistingDigest>;
    reservation?: DigestRequestReservation;
  } = {},
) => {
  const existing = options.existing ?? [];
  const reserve = vi.fn(() => RA.ok(options.reservation ?? { allowed: true as const }));
  const createRun = vi.fn(() =>
    RA.ok({
      status: 'created' as const,
      trigger: 'requested' as const,
      digestDate: '2026-11-05',
      digestId,
      articleId,
      replaced: existing.length > 0,
      durationMs: 10,
      topics: 0,
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
  const resolveHeaders = vi.fn(() => RA.ok(existing.map((digest) => digest.header)));
  const find = (id: ArticleId) => existing.find((digest) => digest.header.articleId === id);
  const useCase = RequestDigestUseCase.create({
    digestHeadersResolverByUserIdAndDigestDate: { resolve: resolveHeaders },
    articleResolver: {
      resolve: (id) => {
        const digest = find(id);
        return RA.ok(
          digest === undefined || digest.articleMissing === true
            ? undefined
            : { status: digest.status ?? 'draft', createdAt: NOW } as Article,
        );
      },
    },
    articleBodyResolver: {
      resolve: (id) => {
        const digest = find(id);
        return RA.ok(
          digest === undefined
            ? undefined
            : { updatedAt: digest.edited === true ? NOW + 1_000 : NOW } as ArticleBody,
        );
      },
    },
    digestRequestUsageRecorder: { reserve },
    createDailyDigestUseCase: { run: createRun } as unknown as CreateDailyDigestUseCase,
    now: () => NOW,
  });
  return { useCase, reserve, createRun, resolveHeaders };
};

describe('RequestDigestUseCase', () => {
  it('回数を予約して、trigger を requested にして digest を作り、JST の日付を返す', async () => {
    const t = setup();

    const result = await t.useCase.run({ userId });

    expect(result).toEqual({ ok: true, val: { digestId, articleId, digestDate: '2026-11-05', replaced: false } });
    expect(t.resolveHeaders).toHaveBeenCalledWith({ userId, digestDate: '2026-11-05' });
    expect(t.reserve).toHaveBeenCalledWith({ userId, day: '2026-11-05', now: NOW });
    expect(t.createRun).toHaveBeenCalledWith({ userId, trigger: 'requested' });
  });

  it('その日の draft の digest があれば予約して作り直し、replaced を true にする', async () => {
    const t = setup({ existing: [existingDigest('summary'), existingDigest('genai')] });

    const result = await t.useCase.run({ userId });

    expect(result).toMatchObject({ ok: true, val: { replaced: true } });
    expect(t.reserve).toHaveBeenCalledTimes(1);
  });

  it('まとめが draft なら、topic の digest が公開済みでも予約して作り直す', async () => {
    const t = setup({
      existing: [existingDigest('summary'), existingDigest('genai', { status: 'published' })],
    });

    const result = await t.useCase.run({ userId });

    expect(result).toMatchObject({ ok: true, val: { replaced: true } });
    expect(t.createRun).toHaveBeenCalledTimes(1);
  });

  it('まとめが編集済みでない draft なら、topic の digest が編集済みでも予約して作り直す', async () => {
    const t = setup({
      existing: [existingDigest('summary'), existingDigest('genai', { edited: true })],
    });

    const result = await t.useCase.run({ userId });

    expect(result).toMatchObject({ ok: true });
    expect(t.createRun).toHaveBeenCalledTimes(1);
  });

  it('その日の digest がすべて編集済みの draft なら、予約せずに DigestDraftEditedError を返す', async () => {
    const t = setup({
      existing: [existingDigest('summary', { edited: true }), existingDigest('genai', { edited: true })],
    });

    const result = await t.useCase.run({ userId });

    expect(result).toMatchObject({
      ok: false,
      err: { type: 'DigestDraftEditedError', detail: { digestDate: '2026-11-05' } },
    });
    expect(t.reserve).not.toHaveBeenCalled();
    expect(t.createRun).not.toHaveBeenCalled();
  });

  it('まとめが編集済みなら、topic の digest が draft でも予約せずに DigestDraftEditedError を返す', async () => {
    const t = setup({
      existing: [existingDigest('summary', { edited: true }), existingDigest('genai')],
    });

    const result = await t.useCase.run({ userId });

    expect(result).toMatchObject({ ok: false, err: { type: 'DigestDraftEditedError' } });
    expect(t.reserve).not.toHaveBeenCalled();
    expect(t.createRun).not.toHaveBeenCalled();
  });

  it.each(['published', 'unpublished'] as const)(
    'まとめが %s なら、topic の digest が draft でも予約せずに DigestAlreadyPublishedError を返し、作成を呼ばない',
    async (status) => {
      const t = setup({ existing: [existingDigest('summary', { status }), existingDigest('genai')] });

      const result = await t.useCase.run({ userId });

      expect(result).toMatchObject({ ok: false, err: { type: 'DigestAlreadyPublishedError' } });
      expect(t.reserve).not.toHaveBeenCalled();
      expect(t.createRun).not.toHaveBeenCalled();
    },
  );

  it('まとめが公開済みなら、topic の digest が編集済みでも DigestAlreadyPublishedError を返す', async () => {
    const t = setup({
      existing: [existingDigest('summary', { status: 'published' }), existingDigest('genai', { edited: true })],
    });

    const result = await t.useCase.run({ userId });

    expect(result).toMatchObject({ ok: false, err: { type: 'DigestAlreadyPublishedError' } });
    expect(t.reserve).not.toHaveBeenCalled();
  });

  it.each(['published', 'unpublished'] as const)(
    'その日の digest の article がすべて %s なら、予約せずに DigestAlreadyPublishedError を返す',
    async (status) => {
      const t = setup({ existing: [existingDigest('summary', { status }), existingDigest('genai', { status })] });

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
    const t = setup({ existing: [existingDigest('summary', { articleMissing: true })] });

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
