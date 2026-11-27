import type { WorkspaceScenario } from '../../workspace/scenario';
import { docTab, editorTab, inquiry, lessonScenario, opening, posts, whyNotRecorded } from './common';

const introduction = [inquiry, whyNotRecorded] as const;

export const chapter1Question: WorkspaceScenario = lessonScenario({
  id: 'chapter-1-question',
  label: '普段の業務で運用しているシステムの問いを1つ挙げる',
  history: introduction,
  timeline: opening(posts.afterIncident, posts.ownQuestion, posts.afterOwnQuestion),
  done: 'question:written',
  tabs: [docTab('memo', 'データ変更の記録について', 'records/data-change-history')],
});

export const chapter1RunTests: WorkspaceScenario = lessonScenario({
  id: 'chapter-1-run-tests',
  label: 'テストを実行する',
  history: [...introduction, posts.afterIncident, posts.ownQuestion, posts.afterOwnQuestion],
  timeline: [
    ...opening(posts.wantRecord, posts.runTests),
    { when: 'tests:ran', kind: 'post', post: posts.failedFour },
  ],
  done: 'tests:ran',
  tabs: [
    editorTab('editor', 'visits.test.ts', { snapshot: 'chapter-1-start' }),
    docTab('guide', 'テストの読み方', 'guides/how-to-read-tests'),
  ],
});
