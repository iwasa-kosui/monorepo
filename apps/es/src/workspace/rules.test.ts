import { describe, expect, it } from 'vitest';

import { isMet, keyOf, record } from './conditions';
import {
  fillTemplate,
  formatField,
  interimText,
  judgeReply,
  type LatestData,
  memoViews,
  readField,
  replyGate,
} from './rules';
import type { Condition, GatesConfig, GroundedReply, MemoConfig, SignalName } from './scenario';

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

  it('途中経過の文は、分かっている項目を1行ずつ並べ、分かっていない項目を最後の行にまとめる', () => {
    const views = memoViews(memo, firedOf('sql:target-shown'), new Map());
    expect(interimText('いまの状況です', 'まだ何も', '{labels} は調査中です', ['b', 'a'], views)).toBe(
      'いまの状況です\nア: アの値\nイ は調査中です',
    );
    const all = memoViews(memo, firedOf('sql:target-shown', 'log:target-opened'), new Map());
    expect(interimText('いまの状況です', 'まだ何も', '{labels} は調査中です', ['a', 'b'], all)).toBe(
      'いまの状況です\nア: アの値\nイ: イの値',
    );
  });

  it('分かっている項目が1つも無いときは、「まだ何も」の1行だけにする', () => {
    const views = memoViews(memo, firedOf(), new Map());
    expect(interimText('いまの状況です', 'まだ何も', '{labels} は調査中です', ['a', 'b'], views)).toBe('まだ何も');
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

describe('結果から読む値', () => {
  const row = {
    operated_by: '受付スタッフ',
    reason: '飼い主の都合',
    event_at: '2026-11-24T05:12:33.123Z',
    event_name: 'VisitCancelled',
  };
  const latestOf = (data: Record<string, unknown>): LatestData => new Map([['sql:target-shown', data]]);

  it('日時は、秒までを「日付 時刻」の形にする', () => {
    expect(formatField('2026-11-24T05:12:33.123Z', 'datetime')).toBe('2026-11-24 05:12:33');
    expect(formatField('昨日', 'datetime')).toBe('昨日');
    expect(formatField('そのまま', undefined)).toBe('そのまま');
  });

  it('行の値を読み、ラベルがあれば置き換える。値が無ければ読めない', () => {
    const latest = latestOf({ row });
    expect(readField(latest, { signal: 'sql:target-shown', field: 'reason' })).toBe('飼い主の都合');
    expect(
      readField(latest, {
        signal: 'sql:target-shown',
        field: 'event_name',
        labels: { VisitCancelled: '来院のキャンセル' },
      }),
    )
      .toBe('来院のキャンセル');
    expect(readField(latest, { signal: 'sql:target-shown', field: 'missing' })).toBeUndefined();
    expect(readField(new Map(), { signal: 'sql:target-shown', field: 'reason' })).toBeUndefined();
    expect(readField(latestOf({ row: { reason: '' } }), { signal: 'sql:target-shown', field: 'reason' }))
      .toBeUndefined();
  });

  it('メモの項目は、合図の条件に加えて値が読めたときだけ埋まる。読めなければ既定の文を出さない', () => {
    const readMemo: MemoConfig = {
      title: 'メモ',
      unknown: '結果を確認してください',
      items: [{
        key: 'who',
        label: '誰が',
        text: '使わない',
        result: 'found',
        fill: 'sql:target-shown',
        read: { signal: 'sql:target-shown', field: 'operated_by' },
      }],
    };
    const fired = firedOf('sql:target-shown');
    expect(memoViews(readMemo, fired, new Map(), latestOf({ row })).map((view) => [view.state, view.text])).toEqual([
      ['found', '受付スタッフ'],
    ]);
    expect(memoViews(readMemo, fired, new Map(), latestOf({ row: {} })).map((view) => [view.state, view.text]))
      .toEqual([['unknown', '結果を確認してください']]);
    expect(memoViews(readMemo, fired, new Map()).map((view) => [view.state, view.text])).toEqual([
      ['unknown', '結果を確認してください'],
    ]);
  });

  it('返信の文は、波かっこの欄を結果の値で埋める', () => {
    expect(
      fillTemplate('{operated_by}が、{reason}でキャンセルしました。日時は {event_at} です。', { row }, {
        event_at: 'datetime',
      }),
    ).toBe('受付スタッフが、飼い主の都合でキャンセルしました。日時は 2026-11-24 05:12:33 です。');
    expect(fillTemplate('{unknown}', { row })).toBe('{unknown}');
  });
});

describe('選択した行から作る調査メモ', () => {
  const memo: MemoConfig = {
    title: 'メモ',
    unknown: '結果の表から行を選択してください',
    items: [
      {
        key: 'who',
        label: '誰が',
        text: '使わない',
        result: 'found',
        fill: 'sql:row-selected',
        read: { signal: 'sql:row-selected', field: 'operated_by', absent: '記録なし' },
      },
      {
        key: 'what',
        label: '何を',
        text: '使わない',
        result: 'found',
        fill: 'sql:row-selected',
        read: {
          signal: 'sql:row-selected',
          field: 'event_name',
          absent: '記録なし',
          labels: { VisitCancelled: '来院のキャンセル' },
        },
      },
    ],
  };
  const selected = (row: Record<string, string | null>): LatestData => new Map([['sql:row-selected', { row }]]);
  const textsOf = (fired: ReturnType<typeof firedOf>, latest: LatestData) =>
    memoViews(memo, fired, new Map(), latest).map((view) => [view.state, view.text]);

  it('行を選択する前は、すべての項目が未入力で、選択を促す文を出す', () => {
    expect(textsOf(firedOf(), new Map())).toEqual([
      ['unknown', '結果の表から行を選択してください'],
      ['unknown', '結果の表から行を選択してください'],
    ]);
  });

  it('選択した行の値を、項目ごとに表示する', () => {
    const row = { id: 'visit-pochi', operated_by: '受付スタッフ', event_name: 'VisitCancelled' };
    expect(textsOf(firedOf('sql:row-selected'), selected(row))).toEqual([
      ['found', '受付スタッフ'],
      ['found', '来院のキャンセル'],
    ]);
  });

  it('選択した行の列が NULL の項目は、見つからない状態で「記録なし」を表示する', () => {
    const row = { id: 'visit-tama', operated_by: null, event_name: null };
    expect(textsOf(firedOf('sql:row-selected'), selected(row))).toEqual([
      ['missing', '記録なし'],
      ['missing', '記録なし'],
    ]);
  });

  it('選択した行に列が無い項目も、見つからない状態で「記録なし」を表示する', () => {
    expect(textsOf(firedOf('sql:row-selected'), selected({ id: 'visit-tama', operated_by: '受付スタッフ' }))).toEqual([
      ['found', '受付スタッフ'],
      ['missing', '記録なし'],
    ]);
  });
});

describe('返信の根拠の判定', () => {
  const grounded: GroundedReply = {
    signal: 'sql:row-selected',
    column: 'id',
    target: 'visit-pochi',
    needs: ['operated_by', 'reason', 'event_at'],
    line: '{operated_by}が、{reason}でキャンセルしてます（{event_at}）',
    formats: { event_at: 'datetime' },
    missing: 'この行には、キャンセルの記録が残ってないです…',
    challenge: { actor: 'support', delay: 0.6, text: '聞き返し' },
  };
  const pochi = {
    id: 'visit-pochi',
    status: 'cancelled',
    event_at: '2026-11-24T05:12:33.123Z',
    event_name: 'VisitCancelled',
    operated_by: '受付スタッフ',
    reason: '飼い主の都合',
  };
  const tama = { id: 'visit-tama', status: 'cancelled', event_at: null, operated_by: null, reason: null };

  it('id が対象の来院と一致する行は、正しい根拠である', () => {
    expect(judgeReply({ row: pochi }, grounded)).toEqual({ kind: 'grounded' });
    expect(judgeReply({ row: tama }, { ...grounded, target: 'visit-tama' })).toEqual({ kind: 'grounded' });
  });

  it('別の来院の行で、必要な値がすべてあれば、その行の値で返信文を作る', () => {
    expect(judgeReply({ row: pochi }, { ...grounded, target: 'visit-tama' })).toEqual({
      kind: 'ungrounded',
      text: '受付スタッフが、飼い主の都合でキャンセルしてます（2026-11-24 05:12:33）',
    });
  });

  it('別の来院の行で、必要な値が1つでも欠けていれば、記録が残っていない旨の返信文にする', () => {
    expect(judgeReply({ row: tama }, grounded)).toEqual({ kind: 'ungrounded', text: grounded.missing });
    expect(judgeReply({ row: { ...pochi, id: 'visit-x', reason: null } }, grounded)).toEqual({
      kind: 'ungrounded',
      text: grounded.missing,
    });
    expect(judgeReply({ row: { ...pochi, id: 'visit-x', reason: '' } }, grounded)).toEqual({
      kind: 'ungrounded',
      text: grounded.missing,
    });
  });

  it('返信文に行の値が要る場面では、id が一致しても必要な値が欠けていれば、誤った根拠で、別の聞き返しにする', () => {
    const needing: GroundedReply = { ...grounded, incomplete: { challenge: '値の聞き返し' } };
    expect(judgeReply({ row: { id: 'visit-pochi' } }, needing)).toEqual({
      kind: 'ungrounded',
      text: needing.missing,
      challenge: '値の聞き返し',
    });
    expect(judgeReply({ row: { ...pochi, reason: null } }, needing)).toEqual({
      kind: 'ungrounded',
      text: needing.missing,
      challenge: '値の聞き返し',
    });
  });

  it('返信文に行の値が要る場面では、id が一致し必要な値がそろっていれば、正しい根拠である', () => {
    const needing: GroundedReply = { ...grounded, incomplete: { challenge: '値の聞き返し' } };
    expect(judgeReply({ row: pochi }, needing)).toEqual({ kind: 'grounded' });
  });

  it('返信文に行の値が要る場面でも、id が一致しない行の聞き返しは変わらない', () => {
    const needing: GroundedReply = { ...grounded, incomplete: { challenge: '値の聞き返し' } };
    expect(judgeReply({ row: tama }, needing)).toEqual({ kind: 'ungrounded', text: needing.missing });
  });

  it('返信文が固定の場面では、id が一致し値が NULL の行も、正しい根拠である', () => {
    expect(judgeReply({ row: tama }, { ...grounded, target: 'visit-tama' })).toEqual({ kind: 'grounded' });
  });

  it('id の列が無い行は、誤った根拠である', () => {
    const { id: _id, ...withoutId } = pochi;
    expect(judgeReply({ row: withoutId }, grounded).kind).toBe('ungrounded');
    expect(judgeReply({ row: { event_at: null } }, grounded)).toEqual({ kind: 'ungrounded', text: grounded.missing });
  });

  it('行が選択されていないときは、誤った根拠で、記録が残っていない旨の返信文にする', () => {
    expect(judgeReply(undefined, grounded)).toEqual({ kind: 'ungrounded', text: grounded.missing });
  });
});
