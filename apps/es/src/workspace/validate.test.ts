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

  it('chat.channels に無いチャンネルを指す発言を見つける', () => {
    const broken: WorkspaceScenario = {
      ...incidentScenario,
      history: [{ actor: 'support', channel: '# nowhere', text: 'x' }],
      timeline: [{ at: 1, kind: 'post', post: { actor: 'support', channel: '# elsewhere', text: 'y' } }],
    };
    const problems = scenarioProblems(broken).join('\n');
    expect(problems).toContain('history[0] のチャンネル # nowhere');
    expect(problems).toContain('timeline[0] のチャンネル # elsewhere');
  });

  it('at 指定の発言に付けた delay を見つける', () => {
    const broken: WorkspaceScenario = {
      ...incidentScenario,
      timeline: [{ at: 1, kind: 'post', post: { actor: 'support', text: 'y' }, delay: 0.6 }],
    };
    expect(scenarioProblems(broken).join('\n')).toContain('timeline[0] は at 指定なので、delay は使われません');
  });

  it('chat.channels にあるチャンネルを指す発言は、問題にしない', () => {
    const channel = incidentScenario.chat.channels[0]?.name ?? '';
    const scenario: WorkspaceScenario = {
      ...incidentScenario,
      history: [{ actor: 'support', channel, text: 'x' }],
    };
    expect(scenarioProblems(scenario)).toEqual([]);
  });
});
