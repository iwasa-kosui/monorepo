import { describe, expect, it } from 'vitest';

import { scenarioProblems } from '../../workspace/validate';
import { eventCenteredEditor } from './scenario';

describe('質問のページのエディタのシナリオ', () => {
  it('シナリオの検査で問題が 0 件である', () => {
    expect(scenarioProblems(eventCenteredEditor)).toEqual([]);
  });

  it('タブはエディタの 1 つだけで、最初に visits.ts を開く', () => {
    expect(eventCenteredEditor.tabs).toHaveLength(1);
    const [tab] = eventCenteredEditor.tabs;
    expect(tab?.kind).toBe('editor');
    if (tab?.kind === 'editor') {
      expect(tab.config.active).toBe('visits.ts');
      expect(tab.config.branch).toBe('event-centered');
    }
  });

  it('チャットの欄を出さず、チャットの接続の設定も持たない', () => {
    expect(eventCenteredEditor.history).toEqual([]);
    expect(eventCenteredEditor.timeline).toEqual([]);
    expect(eventCenteredEditor.chat.collapsed).toBe(true);
    expect(eventCenteredEditor.chat.live).toBeUndefined();
  });
});
