import type { WorkspaceScenario } from '../../workspace/scenario';
import { editorTab, lessonScenario } from '../chapters/common';

export const eventCenteredEditor: WorkspaceScenario = lessonScenario({
  id: 'questions-event-centered',
  label: '来院のキャンセルを、業務イベントを返す関数と保存する処理で書いたコードを読み、テストを実行する',
  tabs: [
    editorTab('editor', 'visit.ts', { snapshot: 'chapter-2-event-centered', branch: 'event-centered' }),
  ],
  collapsed: true,
  live: false,
});
