import { describe, expect, it } from 'vitest';

import type { Decision } from './choice';
import { prEventsOf } from './pr-timeline';

const adopted = 'append-in-update';

describe('prEventsOf', () => {
  it('最初の提出は、レビューの依頼だけを出し、レビューが届くまで待つ', () => {
    const waiting: Decision = { stage: 'reviewing', submitted: ['db-feature'] };
    expect(prEventsOf(waiting, adopted)).toEqual([{ kind: 'request', option: 'db-feature' }]);
  });

  it('採用案以外のレビューが届くと、Changes requested のレビューを加える', () => {
    const changes: Decision = { stage: 'speaking', submitted: ['db-feature'] };
    expect(prEventsOf(changes, adopted)).toEqual([
      { kind: 'request', option: 'db-feature' },
      { kind: 'review', option: 'db-feature', state: 'changes-requested' },
    ]);
  });

  it('選び直すと、更新、レビューの依頼、レビューの順に加える', () => {
    const waiting: Decision = { stage: 'reviewing', submitted: ['db-feature', 'write-to-log'] };
    expect(prEventsOf(waiting, adopted)).toEqual([
      { kind: 'request', option: 'db-feature' },
      { kind: 'review', option: 'db-feature', state: 'changes-requested' },
      { kind: 'commit', option: 'write-to-log' },
      { kind: 'request', option: 'write-to-log' },
    ]);
  });

  it('採用案のレビューが届くと、Approved のレビューと、決定と結果を追記する更新を最後に加える', () => {
    const approved: Decision = { stage: 'approved', submitted: ['db-feature', adopted] };
    expect(prEventsOf(approved, adopted)).toEqual([
      { kind: 'request', option: 'db-feature' },
      { kind: 'review', option: 'db-feature', state: 'changes-requested' },
      { kind: 'commit', option: adopted },
      { kind: 'request', option: adopted },
      { kind: 'review', option: adopted, state: 'approved' },
      { kind: 'commit', option: null },
    ]);
  });

  it('状態が進むたびに、出来事は前の出来事の後ろへ加わるだけで、順序を変えない', () => {
    const steps: Decision[] = [
      { stage: 'reviewing', submitted: ['a'] },
      { stage: 'speaking', submitted: ['a'] },
      { stage: 'choosing', submitted: ['a'] },
      { stage: 'reviewing', submitted: ['a', 'b'] },
      { stage: 'speaking', submitted: ['a', 'b'] },
      { stage: 'reviewing', submitted: ['a', 'b', adopted] },
      { stage: 'approved', submitted: ['a', 'b', adopted] },
    ];
    const lists = steps.map((step) => prEventsOf(step, adopted));
    lists.forEach((list, index) => {
      const previous = lists[index - 1] ?? [];
      expect(list.slice(0, previous.length)).toEqual(previous);
    });
  });

  it('何も提出していなければ、出来事は無い', () => {
    expect(prEventsOf({ stage: 'choosing', submitted: [] }, adopted)).toEqual([]);
  });
});
