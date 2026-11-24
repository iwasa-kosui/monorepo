import type { Post, TabDefinition, WorkspaceScenario } from '../../workspace/scenario';
import { docTab, editorTab, inquiry, lessonScenario, opening, posts, thanks, whyNotRecorded } from './common';

const earlier: readonly Post[] = [
  inquiry,
  whyNotRecorded,
  posts.afterIncident,
  posts.ownQuestion,
  posts.wantRecord,
  posts.runTests,
  posts.failedFour,
];

export const chapter2Explain: WorkspaceScenario = lessonScenario({
  id: 'chapter-2-explain',
  label: '更新処理の中で記録する方針',
  history: earlier,
  timeline: opening(posts.designMemo),
  tabs: [docTab('memo', '設計メモ: 更新処理の中で記録する', 'design/record-in-update')],
});

export const chapter2Rollback: WorkspaceScenario = lessonScenario({
  id: 'chapter-2-rollback',
  label: '記録に失敗すると、来院の更新も戻る',
  history: [...earlier, posts.designMemo],
  timeline: opening(posts.checkRollback),
  tabs: [
    editorTab('editor', 'fail-record.ts'),
    docTab('guide', '確認の手順: 記録に失敗したとき', 'guides/rollback-check'),
  ],
});

export const chapter2Columns: WorkspaceScenario = lessonScenario({
  id: 'chapter-2-columns',
  label: '記録のテーブルの列',
  history: [...earlier, posts.designMemo, posts.checkRollback],
  timeline: opening(posts.columnsMemo),
  tabs: [docTab('memo', '設計メモ: 記録の列', 'design/record-columns')],
});

const exerciseTab: TabDefinition = editorTab('editor', 'visits.ts');

export const chapter2Step1: WorkspaceScenario = lessonScenario({
  id: 'chapter-2-step-1',
  label: '演習 ステップ1: キャンセルを記録する',
  history: [inquiry],
  collapsed: true,
  tabs: [exerciseTab],
});

export const chapter2Step2: WorkspaceScenario = lessonScenario({
  id: 'chapter-2-step-2',
  label: '演習 ステップ2: 理由と操作した人を記録する',
  history: [inquiry],
  collapsed: true,
  timeline: [{ when: 'tests:passed', kind: 'post', post: thanks }],
  tabs: [exerciseTab],
});

export const chapter2Change: WorkspaceScenario = lessonScenario({
  id: 'chapter-2-change',
  label: '記録を足すと visits.ts は何行変わるか',
  history: [inquiry, thanks],
  timeline: opening(posts.prSeen, posts.prRemaining),
  tabs: [
    {
      key: 'pr',
      kind: 'pr',
      title: 'キャンセルの記録を足す',
      label: 'プルリクエスト',
      url: 'https://code.internal.example/clinic/clinic-api/pull/1',
      favicon: { tone: 'ink', shape: 'circle' },
      config: {
        owner: 'clinic',
        name: 'clinic-api',
        number: 1,
        title: 'キャンセルの記録を足す',
        status: 'Open',
        diff: { file: 'visits.ts', before: 'chapter-1-start', after: 'chapter-2-step-2', context: 3 },
      },
    },
  ],
});
