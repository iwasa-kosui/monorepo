import { describe, expect, it } from 'vitest';

import { assertScenario } from '../../workspace/validate';
import { devChannel } from '../chapters/common';
import { accessLogLimit, backupLimit, backupRestoreLimit, evidenceScenario } from './evidence-scenario';

describe('証拠の調査の筋書き', () => {
  it('筋書きの検査を通る', () => {
    expect(() => assertScenario(evidenceScenario)).not.toThrow();
  });

  it('テックリードの発言が2件あり、どちらも「# dev」に属して、ログの確認とバックアップの復元で届く', () => {
    expect(devChannel).toBe('# dev');
    expect(evidenceScenario.timeline).toEqual([
      { when: 'log:target-opened', kind: 'post', post: accessLogLimit },
      { when: 'log:target-opened', kind: 'tab', tab: 'explain', action: 'add' },
      { when: 'sql:executed', key: 'restored', kind: 'post', post: backupLimit },
      { when: 'sql:executed', key: 'restored', kind: 'post', post: backupRestoreLimit },
      { when: 'sql:executed', key: 'restored', kind: 'tab', tab: 'explain', action: 'add' },
    ]);
    for (const post of [accessLogLimit, backupLimit, backupRestoreLimit]) {
      expect(post.actor).toBe('techlead');
      expect(post.channel).toBe(devChannel);
    }
  });

  it('テックリードの発言の時刻は、問い合わせの最後の発言より後である', () => {
    const lastInquiry = evidenceScenario.history.map((post) => post.time ?? '').sort().at(-1) ?? '';
    expect(lastInquiry).toBe('18:24');
    for (const post of [accessLogLimit, backupLimit, backupRestoreLimit]) {
      expect((post.time ?? '') > lastInquiry).toBe(true);
    }
  });

  it('解説のタブは、ログの確認とバックアップの復元で追加される', () => {
    const additions = evidenceScenario.timeline.filter((event) => event.kind === 'tab');
    expect(additions).toHaveLength(2);
    for (const event of additions) {
      expect(event).toMatchObject({ tab: 'explain', action: 'add' });
    }
    expect(additions.map((event) => [event.when, event.key])).toEqual([
      ['log:target-opened', undefined],
      ['sql:executed', 'restored'],
    ]);
  });

  it('解説の文書のタブがあり、最初は表示されない', () => {
    const explain = evidenceScenario.tabs.find((tab) => tab.key === 'explain');
    expect(explain?.kind).toBe('doc');
    expect(explain?.initial).toBe(false);
  });
});
