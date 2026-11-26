import { describe, expect, it } from 'vitest';

import { approvalDetail, approvalLabel, parseActionState, toggleApproval } from './approval';

describe('toggleApproval', () => {
  it('押すたびに承認の有無が入れ替わる', () => {
    expect(toggleApproval(false)).toBe(true);
    expect(toggleApproval(true)).toBe(false);
  });
});

describe('approvalLabel', () => {
  it('承認前は Approve、承認後は Approved を返す', () => {
    expect(approvalLabel(false)).toBe('Approve');
    expect(approvalLabel(true)).toBe('Approved');
  });
});

describe('approvalDetail', () => {
  it('承認すると、帯を完了の状態にする', () => {
    expect(approvalDetail(true, 'listen')).toEqual({ state: 'done' });
  });

  it('承認を外すと、ページを開いたときの状態に戻す', () => {
    expect(approvalDetail(false, 'listen')).toEqual({ state: 'listen' });
    expect(approvalDetail(false, 'do')).toEqual({ state: 'do' });
  });

  it('帯の文とボタンは渡さない', () => {
    expect(Object.keys(approvalDetail(true, 'listen'))).toEqual(['state']);
    expect(Object.keys(approvalDetail(false, 'listen'))).toEqual(['state']);
  });
});

describe('parseActionState', () => {
  it('帯の data-state を読み、知らない値は listen にする', () => {
    expect(parseActionState('listen')).toBe('listen');
    expect(parseActionState('do')).toBe('do');
    expect(parseActionState('done')).toBe('done');
    expect(parseActionState(undefined)).toBe('listen');
    expect(parseActionState('other')).toBe('listen');
  });
});
