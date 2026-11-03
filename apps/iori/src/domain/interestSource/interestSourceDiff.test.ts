import { describe, expect, it } from 'vitest';

import { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';
import { InterestSource } from './interestSource.ts';
import { type DesiredInterestSource, InterestSourceDiff } from './interestSourceDiff.ts';

const now = Instant.orThrow(Date.UTC(2026, 10, 4, 21, 30));
const later = Instant.orThrow(Date.UTC(2026, 10, 5, 21, 30));
const userId = UserId.generate();

const hashOf = (letter: string) => letter.repeat(64);

const existing = (ref: string, hash: string, deleted = false): InterestSource => {
  const created = InterestSource.create(
    { userId, kind: 'own_post', ref, contentHash: hashOf(hash), occurredAt: now },
    now,
  );
  if (!created.ok) throw new Error('unexpected');
  const source = created.val.aggregateState;
  return deleted ? InterestSource.markDeleted(source, later).aggregateState : source;
};

const desired = (ref: string, hash: string): DesiredInterestSource => ({
  ref,
  contentHash: hashOf(hash),
  occurredAt: later,
});

describe('InterestSourceDiff.compute', () => {
  it('現在の集合にだけある ref を created にする', () => {
    const diff = InterestSourceDiff.compute([], [desired('a', 'a'), desired('b', 'b')]);

    expect(diff.created.map((item) => item.ref)).toEqual(['a', 'b']);
    expect(diff.changed).toEqual([]);
    expect(diff.deleted).toEqual([]);
  });

  it('contentHash が違う ref を changed にし、同じ ref は何もしない', () => {
    const same = existing('same', 'a');
    const differs = existing('differs', 'a');

    const diff = InterestSourceDiff.compute([same, differs], [desired('same', 'a'), desired('differs', 'b')]);

    expect(diff.created).toEqual([]);
    expect(diff.changed).toEqual([{ source: differs, desired: desired('differs', 'b') }]);
    expect(diff.deleted).toEqual([]);
  });

  it('未削除で現在の集合に無い行を deleted にする', () => {
    const gone = existing('gone', 'a');
    const kept = existing('kept', 'a');

    const diff = InterestSourceDiff.compute([gone, kept], [desired('kept', 'a')]);

    expect(diff.deleted).toEqual([gone]);
    expect(diff.created).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it('削除済みの行は、現在の集合に無ければ何もせず、再び現れたら hash が同じでも changed にする', () => {
    const goneForGood = existing('gone', 'a', true);
    const revived = existing('revived', 'a', true);

    const diff = InterestSourceDiff.compute([goneForGood, revived], [desired('revived', 'a')]);

    expect(diff.deleted).toEqual([]);
    expect(diff.created).toEqual([]);
    expect(diff.changed).toEqual([{ source: revived, desired: desired('revived', 'a') }]);
  });

  it('現在の集合に同じ ref が複数あれば最初の 1 件だけを使う', () => {
    const diff = InterestSourceDiff.compute([], [desired('a', 'a'), desired('a', 'b')]);

    expect(diff.created).toEqual([desired('a', 'a')]);
  });
});
