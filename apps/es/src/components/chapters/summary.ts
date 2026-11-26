import type { WorkspaceScenario } from '../../workspace/scenario';
import { docTab, lessonScenario, opening, posts } from './common';

export const summaryToday: WorkspaceScenario = lessonScenario({
  id: 'summary-today',
  label: '今日やったことを振り返る',
  history: [posts.takeHome, posts.startingCodes],
  timeline: opening(posts.goodWork, posts.todayMemo),
  tabs: [docTab('memo', '今日やったこと', 'records/today')],
});

export const summaryDecide: WorkspaceScenario = lessonScenario({
  id: 'summary-decide',
  label: '自分のシステムで記録を足す更新処理を1つ決める',
  history: [posts.goodWork, posts.todayMemo],
  timeline: opening(posts.decideLast, posts.skipIfNone),
  done: 'question:written',
  tabs: [docTab('memo', '持ち帰る手順', 'guides/takeaway-steps')],
});
