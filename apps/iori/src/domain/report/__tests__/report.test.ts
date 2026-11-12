import { describe, expect, it } from 'vitest';

import { ActorId } from '../../actor/actorId.ts';
import { Instant } from '../../instant/instant.ts';
import { PostId } from '../../post/postId.ts';
import { UserId } from '../../user/userId.ts';
import { MAX_REPORT_COMMENT_LENGTH, MAX_REPORT_STATUS_COUNT, Report } from '../report.ts';

const now = Instant.orThrow(Date.UTC(2026, 10, 12));

const input = () => ({
  userId: UserId.generate(),
  targetActorId: ActorId.generate(),
  statusIds: [PostId.generate()],
  category: 'spam' as const,
  comment: '宣伝ばかりです',
  forwarded: true,
});

describe('Report.submit', () => {
  it('report.reportSubmitted を作り、payload に通報の内容をすべて入れる', () => {
    const base = input();

    const submitted = Report.submit(base, now);

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    expect(submitted.val).toMatchObject({
      aggregateName: 'report',
      eventName: 'report.reportSubmitted',
      occurredAt: now,
      eventPayload: base,
    });
    expect(submitted.val.eventPayload.reportId).toMatch(/^[0-9a-f-]{36}$/);
    expect(submitted.val.aggregateId).toEqual({ reportId: submitted.val.eventPayload.reportId });
  });

  it('aggregateState は ID だけにして、comment を入れない', () => {
    const base = input();

    const submitted = Report.submit(base, now);

    expect(submitted.ok && submitted.val.aggregateState).toEqual({
      reportId: submitted.ok ? submitted.val.eventPayload.reportId : undefined,
      userId: base.userId,
      targetActorId: base.targetActorId,
    });
  });

  it('呼ぶたびに別の reportId を作る', () => {
    const base = input();

    const first = Report.submit(base, now);
    const second = Report.submit(base, now);

    expect(first.ok && second.ok && first.val.eventPayload.reportId !== second.val.eventPayload.reportId).toBe(true);
  });

  it('statusIds が空でも、comment が空でも受け付ける', () => {
    expect(Report.submit({ ...input(), statusIds: [], comment: '' }, now).ok).toBe(true);
  });

  it('comment は 1000 文字まで受け付け、超えると拒否する', () => {
    expect(Report.submit({ ...input(), comment: 'あ'.repeat(MAX_REPORT_COMMENT_LENGTH) }, now).ok).toBe(true);

    const tooLong = Report.submit({ ...input(), comment: 'あ'.repeat(MAX_REPORT_COMMENT_LENGTH + 1) }, now);

    expect(tooLong.ok).toBe(false);
    expect(!tooLong.ok && tooLong.err.type).toBe('InvalidReportError');
  });

  it('statusIds が上限を超えると拒否する', () => {
    const statusIds = Array.from({ length: MAX_REPORT_STATUS_COUNT + 1 }, () => PostId.generate());

    expect(Report.submit({ ...input(), statusIds }, now).ok).toBe(false);
  });

  it('理由が一覧にない値だと拒否する', () => {
    expect(Report.submit({ ...input(), category: 'legal' as never }, now).ok).toBe(false);
  });
});
