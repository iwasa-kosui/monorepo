import { describe, expect, it } from 'vitest';

import { ActorId } from '../../actor/actorId.ts';
import { Instant } from '../../instant/instant.ts';
import { PostId } from '../../post/postId.ts';
import { UserId } from '../../user/userId.ts';
import { Report } from '../report.ts';

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
  it('aggregateState は ID だけにして、comment を入れない', () => {
    const base = input();

    const submitted = Report.submit(base, now);

    expect(submitted.ok && submitted.val.aggregateState).toEqual({
      reportId: submitted.ok ? submitted.val.eventPayload.reportId : undefined,
      userId: base.userId,
      targetActorId: base.targetActorId,
    });
  });

  it('statusIds が空でも、comment が空でも受け付ける', () => {
    expect(Report.submit({ ...input(), statusIds: [], comment: '' }, now).ok).toBe(true);
  });
});
