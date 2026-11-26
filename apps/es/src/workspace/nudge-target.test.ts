import { describe, expect, it } from 'vitest';

import { record } from './conditions';
import {
  nextSignals,
  type NudgeContext,
  nudgeSpecOf,
  restoredKey,
  restoreSelector,
  signalSelectors,
  unmetSignals,
} from './nudge-target';
import type { Condition, GatesConfig, SignalName } from './scenario';

const firedOf = (...entries: (SignalName | readonly [SignalName, string])[]) => {
  const fired = new Map<SignalName, Set<string>>();
  for (const entry of entries) {
    if (typeof entry === 'string') record(fired, entry, '');
    else record(fired, entry[0], entry[1]);
  }
  return fired;
};

const context: NudgeContext = {
  tabs: [
    { key: 'console', kind: 'console' },
    { key: 'logs', kind: 'logs' },
    { key: 'backup', kind: 'slot' },
  ],
  selected: 'console',
};

describe('unmetSignals', () => {
  it('満たされた条件からは、未達のシグナルを返さない', () => {
    expect(unmetSignals(firedOf('sql:executed'), 'sql:executed')).toEqual([]);
  });

  it('単独のシグナルが未達なら、そのシグナルだけを返す', () => {
    expect(unmetSignals(firedOf(), 'tests:passed')).toEqual(['tests:passed']);
  });

  it('all は、未達のシグナルを宣言順にすべて返す', () => {
    const condition: Condition = { all: ['sql:executed', 'log:target-opened', 'tests:passed'] };
    expect(unmetSignals(firedOf(), condition)).toEqual(['sql:executed', 'log:target-opened', 'tests:passed']);
    expect(unmetSignals(firedOf('sql:executed'), condition)).toEqual(['log:target-opened', 'tests:passed']);
    expect(unmetSignals(firedOf('sql:executed', 'log:target-opened'), condition)).toEqual(['tests:passed']);
    expect(unmetSignals(firedOf('sql:executed', 'log:target-opened', 'tests:passed'), condition)).toEqual([]);
  });

  it('any は、どれも未達なら全部を宣言順に返し、1つでも満たせば何も返さない', () => {
    const condition: Condition = { any: ['code:run', 'tests:passed'] };
    expect(unmetSignals(firedOf(), condition)).toEqual(['code:run', 'tests:passed']);
    expect(unmetSignals(firedOf('tests:passed'), condition)).toEqual([]);
  });

  it('入れ子の条件をたどり、キー付きの参照はキーごと返す', () => {
    const condition: Condition = {
      all: ['log:target-opened', { any: [{ name: 'tab:selected', key: 'repo' }, 'agent:concluded'] }],
    };
    expect(unmetSignals(firedOf('log:target-opened'), condition)).toEqual([
      { name: 'tab:selected', key: 'repo' },
      'agent:concluded',
    ]);
    expect(unmetSignals(firedOf('log:target-opened', ['tab:selected', 'repo']), condition)).toEqual([]);
    expect(unmetSignals(firedOf('log:target-opened', ['tab:selected', 'console']), condition)).toEqual([
      { name: 'tab:selected', key: 'repo' },
      'agent:concluded',
    ]);
  });
});

describe('nextSignals', () => {
  const gates: GatesConfig = {
    reply: {
      requires: [
        { signal: { name: 'tab:selected', key: 'logs' }, reason: 'ログを開きます。' },
        { signal: 'sql:target-shown', reason: 'DB を見ます。' },
      ],
      reasons: { all: 'まだ何も見ていません。', several: 'あと {count} つです。' },
    },
  };

  it('返信のゲートが開くまでは、未達の要件を宣言順にすべて返す', () => {
    expect(nextSignals(firedOf(), gates, 'chat:replied')).toEqual([
      { name: 'tab:selected', key: 'logs' },
      'sql:target-shown',
    ]);
    expect(nextSignals(firedOf(['tab:selected', 'logs']), gates, 'chat:replied')).toEqual(['sql:target-shown']);
  });

  it('ゲートが開いたら、完了の条件の未達のシグナルを返す', () => {
    expect(nextSignals(firedOf(['tab:selected', 'logs'], 'sql:target-shown'), gates, 'chat:replied')).toEqual([
      'chat:replied',
    ]);
  });

  it('バイパスのシグナルが出ていれば、ゲートは開いたものとして扱う', () => {
    const bypassed: GatesConfig = { reply: { ...gates.reply, bypass: 'agent:concluded' } };
    expect(nextSignals(firedOf('agent:concluded'), bypassed, 'chat:replied')).toEqual(['chat:replied']);
  });

  it('ゲートがなければ、完了の条件だけを見る', () => {
    expect(nextSignals(firedOf(), undefined, { all: ['log:target-opened', 'tests:passed'] })).toEqual([
      'log:target-opened',
      'tests:passed',
    ]);
  });

  it('完了の条件もなければ、空の配列を返す', () => {
    expect(nextSignals(firedOf(), undefined, undefined)).toEqual([]);
  });

  it('最初の未達がログのタブの選択済みで何も指さなくても、2番目の未達が復元ボタンを指す', () => {
    const done: Condition = { all: ['log:target-opened', { name: 'sql:executed', key: restoredKey }] };
    const selectedLogs: NudgeContext = { ...context, selected: 'logs' };
    const specs = nextSignals(firedOf(), undefined, done).map((signal) => nudgeSpecOf(signal, selectedLogs));
    expect(specs).toEqual([null, { selector: restoreSelector }]);
    expect(specs.find((spec) => spec !== null)).toEqual({ selector: '[data-restore]' });
  });
});

describe('nudgeSpecOf', () => {
  it('キー付きの tab:selected は、そのタブのボタンを指す', () => {
    expect(nudgeSpecOf({ name: 'tab:selected', key: 'logs' }, context)).toEqual({ tab: 'logs' });
    expect(nudgeSpecOf('tab:selected', context)).toBeNull();
  });

  it('sql:executed と sql:target-shown は、SQL の実行ボタンを指す', () => {
    expect(nudgeSpecOf('sql:executed', context)).toEqual({ selector: signalSelectors['sql:executed'] });
    expect(nudgeSpecOf('sql:target-shown', context)).toEqual({ selector: '[data-playground="sql"] [data-role="run"]' });
  });

  it('バックアップの復元を待つ sql:executed は、復元ボタンを指す', () => {
    expect(nudgeSpecOf({ name: 'sql:executed', key: 'restored' }, context)).toEqual({ selector: restoreSelector });
    expect(restoreSelector).toBe('[data-restore]');
  });

  it('tests:ran と tests:passed は、テストの実行ボタンを指す', () => {
    expect(nudgeSpecOf('tests:ran', context)).toEqual({ selector: '[data-role="run-tests"]' });
    expect(nudgeSpecOf('tests:passed', context)).toEqual({ selector: '[data-role="run-tests"]' });
  });

  it('code:run は、スクリプトの実行ボタンを指す', () => {
    expect(nudgeSpecOf('code:run', context)).toEqual({
      selector: '[data-run-file]:not([data-role="run-tests"]), [data-play] [data-role="run"]',
    });
  });

  it('figure:step は図の「次へ」を、question:written は質問の入力欄を指す', () => {
    expect(nudgeSpecOf('figure:step', context)).toEqual({
      selector: '[data-before-record-figure] [data-action="next"]',
    });
    expect(nudgeSpecOf('question:written', context)).toEqual({ selector: '[data-own-question] textarea' });
  });

  it('ログのシグナルは、ログのタブが未選択ならそのタブのボタンを指す', () => {
    expect(nudgeSpecOf('log:detail-opened', context)).toEqual({ tab: 'logs' });
    expect(nudgeSpecOf('log:target-opened', context)).toEqual({ tab: 'logs' });
  });

  it('ログのシグナルは、ログのタブが選択済みなら何も指さない', () => {
    expect(nudgeSpecOf('log:target-opened', { ...context, selected: 'logs' })).toBeNull();
  });

  it('ログのタブがないシナリオでは、ログのシグナルは何も指さない', () => {
    expect(nudgeSpecOf('log:target-opened', { tabs: [{ key: 'console', kind: 'console' }], selected: 'console' }))
      .toBeNull();
  });

  it('agent、chat、そのほかのシグナルは何も指さない', () => {
    for (
      const name of [
        'agent:requested',
        'agent:concluded',
        'chat:interim-sent',
        'chat:replied',
        'workspace:started',
      ] as const
    ) {
      expect(nudgeSpecOf(name, context)).toBeNull();
    }
  });
});
