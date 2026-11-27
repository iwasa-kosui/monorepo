import { describe, expect, it } from 'vitest';

import { assertScenario } from '../../workspace/validate';
import { devChannel } from '../chapters/common';
import { accessLogLimit, backupLimit, evidenceScenario } from './evidence-scenario';

describe('証拠の調査の筋書き', () => {
  it('筋書きの検査を通る', () => {
    expect(() => assertScenario(evidenceScenario)).not.toThrow();
  });

  it('テックリードの発言が2件あり、どちらも「# dev」に属して、ログの確認とバックアップの復元で届く', () => {
    expect(devChannel).toBe('# dev');
    expect(evidenceScenario.timeline).toEqual([
      { when: 'log:target-opened', kind: 'post', post: accessLogLimit },
      { when: 'sql:executed', key: 'restored', kind: 'post', post: backupLimit },
    ]);
    for (const post of [accessLogLimit, backupLimit]) {
      expect(post.actor).toBe('techlead');
      expect(post.channel).toBe(devChannel);
    }
  });

  it('解説の文書のタブがある', () => {
    const explain = evidenceScenario.tabs.find((tab) => tab.key === 'explain');
    expect(explain?.kind).toBe('doc');
  });
});
