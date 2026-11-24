import { describe, expect, it } from 'vitest';

import { isMet, keyOf, record } from './conditions';
import { interimText, memoViews, replyGate } from './rules';
import type { Condition, GatesConfig, MemoConfig, SignalName } from './scenario';

const firedOf = (...signals: (SignalName | [SignalName, string])[]) => {
  const fired = new Map<SignalName, Set<string>>();
  for (const signal of signals) {
    if (typeof signal === 'string') record(fired, signal, '');
    else record(fired, signal[0], signal[1]);
  }
  return fired;
};

describe('合図の条件', () => {
  it('合図の名前だけの条件は、その合図が 1 回でも起きれば満たされる', () => {
    expect(isMet(firedOf(), 'sql:target-shown')).toBe(false);
    expect(isMet(firedOf('sql:target-shown'), 'sql:target-shown')).toBe(true);
  });

  it('キーつきの条件は、同じキーの合図だけで満たされる', () => {
    const condition: Condition = { name: 'tab:selected', key: 'repo' };
    expect(isMet(firedOf(['tab:selected', 'logs']), condition)).toBe(false);
    expect(isMet(firedOf(['tab:selected', 'logs'], ['tab:selected', 'repo']), condition)).toBe(true);
  });

  it('all はすべて、any はどれか 1 つで満たされ、入れ子にできる', () => {
    const condition: Condition = {
      any: [{ all: ['sql:target-shown', 'log:target-opened'] }, 'agent:concluded'],
    };
    expect(isMet(firedOf('sql:target-shown'), condition)).toBe(false);
    expect(isMet(firedOf('sql:target-shown', 'log:target-opened'), condition)).toBe(true);
    expect(isMet(firedOf('agent:concluded'), condition)).toBe(true);
  });

  it('合図のデータにキーがなければ、キーは空文字になる', () => {
    expect(keyOf(undefined)).toBe('');
    expect(keyOf({ key: 3 })).toBe('');
    expect(keyOf({ key: 'repo' })).toBe('repo');
  });
});

const memo: MemoConfig = {
  title: 'メモ',
  unknown: '不明',
  items: [
    { key: 'a', label: 'ア', text: 'アの値', result: 'found', fill: 'sql:target-shown' },
    {
      key: 'b',
      label: 'イ',
      text: 'イの値',
      result: 'missing',
      fill: { all: ['sql:target-shown', 'log:target-opened'] },
    },
  ],
};

describe('調査メモ', () => {
  it('条件を満たした項目だけが、結果と値で埋まる', () => {
    expect(memoViews(memo, firedOf('sql:target-shown'), new Map())).toEqual([
      { key: 'a', label: 'ア', state: 'found', text: 'アの値' },
      { key: 'b', label: 'イ', state: 'unknown', text: '不明' },
    ]);
  });

  it('memo の出来事で更新した値は、条件より優先される', () => {
    const views = memoViews(
      memo,
      firedOf(),
      new Map([['a', { state: 'missing' as const, text: '上書き' }], ['b', { state: 'unknown' as const }]]),
    );
    expect(views.map((view) => [view.state, view.text])).toEqual([['missing', '上書き'], ['unknown', '不明']]);
  });

  it('途中経過の文は、指定した順に、分かっていない項目を「調査中」にして並べる', () => {
    const views = memoViews(memo, firedOf('sql:target-shown'), new Map());
    expect(interimText('途中です。', '調査中', ['b', 'a'], views)).toBe('途中です。イ: 調査中 / ア: アの値');
  });
});

const gates: GatesConfig = {
  reply: {
    bypass: 'agent:concluded',
    requires: [
      { signal: 'sql:target-shown', reason: '1 つ目が足りません' },
      { signal: 'log:target-opened', reason: '2 つ目が足りません' },
      { signal: { name: 'tab:selected', key: 'repo' }, reason: '3 つ目が足りません' },
    ],
    reasons: { all: '全部足りません', several: 'あと{count}つです' },
  },
};

describe('返信が有効になる条件', () => {
  it('筋書きに条件がなければ、いつでも返信できる', () => {
    expect(replyGate(undefined, firedOf())).toEqual({ ready: true, reason: '' });
  });

  it('足りない数に合わせて、理由の文が変わる', () => {
    expect(replyGate(gates, firedOf())).toEqual({ ready: false, reason: '全部足りません' });
    expect(replyGate(gates, firedOf('sql:target-shown'))).toEqual({ ready: false, reason: 'あと2つです' });
    expect(replyGate(gates, firedOf('sql:target-shown', 'log:target-opened'))).toEqual({
      ready: false,
      reason: '3 つ目が足りません',
    });
  });

  it('すべてを満たすか、bypass の合図が起きると、返信できる', () => {
    expect(replyGate(gates, firedOf('sql:target-shown', 'log:target-opened', ['tab:selected', 'repo'])).ready).toBe(
      true,
    );
    expect(replyGate(gates, firedOf('agent:concluded')).ready).toBe(true);
  });
});
