import { describe, expect, it } from 'vitest';

import { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';
import { EMBEDDING_DIMENSIONS } from './embedding.ts';
import { InterestSource, type InterestSourceKind, interestSourceKinds } from './interestSource.ts';

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
  it('weights は kind ごとの重みを持つ', () => {
    expect(InterestSource.weights).toEqual({
      kosui_post: 1.0,
      kosui_talk: 1.0,
      kosui_external: 0.8,
      own_post: 0.5,
      own_like: 0.7,
    });
  });

  it('create は kind の重みを持つ未埋め込み、未削除の interestSource.created を返す', () => {
    for (const kind of interestSourceKinds) {
      const result = InterestSource.create(payload(kind), now);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.val).toMatchObject({
        aggregateName: 'interestSource',
        eventName: 'interestSource.created',
        aggregateState: {
          kind,
          weight: InterestSource.weights[kind],
          embeddedAt: null,
          deletedAt: null,
          createdAt: now,
        },
      });
    }
  });

  it('create は SHA-256 の 16 進でない contentHash を拒否する', () => {
    expect(InterestSource.create({ ...payload(), contentHash: 'xyz' }, now).ok).toBe(false);
  });

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

  it('markDeleted は deletedAt を入れた interestSource.deleted を返す', () => {
    const deleted = InterestSource.markDeleted(created(), later);

    expect(deleted).toMatchObject({
      eventName: 'interestSource.deleted',
      aggregateState: { deletedAt: later },
      eventPayload: { deletedAt: later },
    });
  });

  it('embed は 1024 次元のベクトルを payload に持つ interestSource.embedded を返す', () => {
    const embedding = new Float32Array(EMBEDDING_DIMENSIONS);

    const embedded = InterestSource.embed(created(), embedding, later);

    expect(embedded.ok).toBe(true);
    if (!embedded.ok) return;
    expect(embedded.val).toMatchObject({
      eventName: 'interestSource.embedded',
      aggregateState: { embeddedAt: later },
      eventPayload: { embedding, embeddedAt: later },
    });
  });

  it('embed は 1024 次元でないベクトルを拒否する', () => {
    const embedded = InterestSource.embed(created(), new Float32Array(3), later);

    expect(embedded.ok).toBe(false);
  });
});
