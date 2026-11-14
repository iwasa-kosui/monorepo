import { describe, expect, it } from 'vitest';

import { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';
import { EMBEDDING_DIMENSIONS } from './embedding.ts';
import { InterestSource, type InterestSourceKind } from './interestSource.ts';

const now = Instant.orThrow(Date.UTC(2026, 10, 4, 21, 30));
const later = Instant.orThrow(Date.UTC(2026, 10, 5, 21, 30));
const hash = 'a'.repeat(64);

const payload = (kind: InterestSourceKind = 'kosui_post') => ({
  userId: UserId.generate(),
  kind,
  ref: 'https://example.com/a',
  contentHash: hash,
  occurredAt: now,
});

const created = (kind: InterestSourceKind = 'kosui_post') => {
  const result = InterestSource.create(payload(kind), now);
  if (!result.ok) throw new Error('unexpected');
  return result.val.aggregateState;
};

describe('InterestSource', () => {
  it('changeContent は埋め込みと削除を戻し、contentHash と occurredAt を更新する', () => {
    const source = { ...created(), embeddedAt: now, deletedAt: now };

    const changed = InterestSource.changeContent(source, { contentHash: 'b'.repeat(64), occurredAt: later }, later);

    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(changed.val).toMatchObject({
      eventName: 'interestSource.contentChanged',
      eventPayload: { interestSourceId: source.interestSourceId, contentHash: 'b'.repeat(64), occurredAt: later },
      aggregateState: { embeddedAt: null, deletedAt: null, updatedAt: later, createdAt: now },
    });
  });

  describe('copyEmbedding', () => {
    const embedding = Float32Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? 1 : 0));
    const copyPayload = (kind: InterestSourceKind = 'feedback_positive') => ({
      userId: UserId.generate(),
      kind,
      ref: 'https://example.com/a',
      contentHash: hash,
      occurredAt: later,
      embedding,
    });

    it('既存の行があればその ID と createdAt を保ち、削除を戻す', () => {
      const existing = { ...created('feedback_positive'), deletedAt: now };

      const result = InterestSource.copyEmbedding(existing, { ...copyPayload(), userId: existing.userId }, later);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.val.aggregateState).toMatchObject({
        interestSourceId: existing.interestSourceId,
        createdAt: now,
        updatedAt: later,
        deletedAt: null,
      });
    });
  });
});
