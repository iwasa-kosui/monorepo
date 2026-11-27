import { sceneSteps } from '../../playground/scene-steps';
import type { Post, TabDefinition, WorkspaceScenario } from '../../workspace/scenario';
import { docTab, editorTab, inquiry, lessonScenario, opening, posts, thanks, whyNotRecorded } from './common';

const earlier: readonly Post[] = [
  inquiry,
  whyNotRecorded,
  posts.afterIncident,
  posts.ownQuestion,
  posts.afterOwnQuestion,
  posts.wantRecord,
  posts.runTests,
  posts.failedFour,
];

export const chapter2Explain: WorkspaceScenario = lessonScenario({
  id: 'chapter-2-explain',
  label: '更新処理の中で記録する方針',
  history: earlier,
  timeline: opening(posts.decisionRecord),
  tabs: [
    docTab(
      'memo',
      'ADR 1: キャンセルの記録を、来院の更新と同じトランザクションで追記する',
      'adr/1-record-in-update',
      true,
    ),
  ],
});

const stepTab = (step: 1 | 2): TabDefinition =>
  editorTab('editor', 'visits.ts', { snapshot: sceneSteps[step].snapshot });

export const chapter2Step1: WorkspaceScenario = lessonScenario({
  id: 'chapter-2-step-1',
  label: `演習 ${sceneSteps[1].label}`,
  history: [inquiry],
  collapsed: true,
  done: 'tests:passed',
  tabs: [stepTab(1)],
});

export const chapter2Table: WorkspaceScenario = lessonScenario({
  id: 'chapter-2-table',
  label: '記録を1つのテーブルにまとめる',
  history: [...earlier, posts.decisionRecord],
  timeline: opening(posts.tableRecord),
  tabs: [docTab('memo', 'ADR 2: 記録を1つのテーブルにまとめる', 'adr/2-record-table', true)],
});

export const chapter2Step2: WorkspaceScenario = lessonScenario({
  id: 'chapter-2-step-2',
  label: `演習 ${sceneSteps[2].label}`,
  history: [inquiry],
  collapsed: true,
  timeline: [{ when: 'tests:passed', kind: 'post', post: thanks, delay: 0.6 }],
  done: 'tests:passed',
  tabs: [stepTab(2)],
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
