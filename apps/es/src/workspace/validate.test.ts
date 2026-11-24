import { describe, expect, it } from 'vitest';

import { incidentScenario } from '../components/intro/incident-scenario';
import type { WorkspaceScenario } from './scenario';
import { assertScenario, scenarioProblems } from './validate';

describe('筋書きの検査', () => {
  it('障害対応の筋書きには問題がない', () => {
    expect(scenarioProblems(incidentScenario)).toEqual([]);
  });

  it('存在しないタブ、発言者、メモ、ボタンを指す出来事を見つける', () => {
    const broken: WorkspaceScenario = {
      ...incidentScenario,
      history: [{ actor: 'ghost', text: 'x' }],
      timeline: [
        { at: 1, kind: 'tab', tab: 'missing', action: 'open' },
        { at: 2, kind: 'memo', memo: 'nope', state: 'found' },
        { when: 'agent:requested', kind: 'enable', button: 'reply' },
        { kind: 'post', post: { actor: 'support', text: 'y' } } as never,
      ],
      chat: { ...incidentScenario.chat, buttons: [{ name: 'answer', label: 'x' }] },
    };
    const problems = scenarioProblems(broken);
    expect(problems.join('\n')).toContain('ghost');
    expect(problems.join('\n')).toContain('missing');
    expect(problems.join('\n')).toContain('nope');
    expect(problems.join('\n')).toContain('ボタン reply');
    expect(problems.join('\n')).toContain('at と when のどちらか一方');
    expect(() => assertScenario(broken)).toThrow('問題があります');
  });
});
