import { describe, expect, it } from 'vitest';

import { decisionStoreOf } from './decision-store';
import { nextKey } from './option-tabs';

const keys = ['a', 'b', 'c'];

describe('nextKey', () => {
  it('右矢印は次のタブ、左矢印は前のタブへ移り、端では反対の端へ回る', () => {
    expect(nextKey(keys, 'a', 'ArrowRight')).toBe('b');
    expect(nextKey(keys, 'c', 'ArrowRight')).toBe('a');
    expect(nextKey(keys, 'b', 'ArrowLeft')).toBe('a');
    expect(nextKey(keys, 'a', 'ArrowLeft')).toBe('c');
  });

  it('Home は最初、End は最後のタブへ移る', () => {
    expect(nextKey(keys, 'b', 'Home')).toBe('a');
    expect(nextKey(keys, 'b', 'End')).toBe('c');
  });

  it('それ以外のキーと、タブが無い場合は、移らない', () => {
    expect(nextKey(keys, 'a', 'Enter')).toBeNull();
    expect(nextKey([], null, 'ArrowRight')).toBeNull();
  });
});

describe('decisionStoreOf', () => {
  it('同じ持ち主には同じ状態を返し、状態を変えると購読者に伝える', () => {
    const owner = {};
    const store = decisionStoreOf(owner);
    expect(decisionStoreOf(owner)).toBe(store);
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    const next = { stage: 'speaking', submitted: [] } as const;
    store.set(next);
    store.set(next);
    expect(store.get()).toBe(next);
    expect(calls).toBe(1);
  });

  it('持ち主が違えば、状態を共有しない', () => {
    expect(decisionStoreOf({})).not.toBe(decisionStoreOf({}));
  });
});
