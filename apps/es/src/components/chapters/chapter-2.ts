import { sceneSteps } from '../../playground/scene-steps';
import type { Post, TabDefinition, TimelineEvent, WorkspaceScenario } from '../../workspace/scenario';
import { cancelRecordOptions } from '../adr/adr-options';
import {
  adrReviews,
  agentTab,
  docTab,
  editorTab,
  inquiry,
  lessonScenario,
  opening,
  posts,
  thanks,
  whyNotRecorded,
} from './common';

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

export const adoptedOption = 'append-in-update';

const prTabKey = 'memo';
const adrPrTitle = 'ADR 1: キャンセルの記録を、どこに、どう残すか';
const agentTabKey = 'agent';

const reviewPosts: readonly TimelineEvent[] = Object.keys(adrReviews).flatMap((key): TimelineEvent[] => [
  { when: 'option:chosen', key, kind: 'tab', tab: prTabKey, action: 'open' },
  {
    when: 'option:reviewed',
    key,
    kind: 'post',
    post: key === adoptedOption ? posts.reviewApproved : posts.reviewCommented,
  },
  ...(key === adoptedOption
    ? []
    : [{ when: 'option:reviewed', key, kind: 'tab', tab: agentTabKey, action: 'unseen' } satisfies TimelineEvent]),
]);

export const chapter2Explain: WorkspaceScenario = lessonScenario({
  id: 'chapter-2-explain',
  label: '更新処理の中で記録する方針',
  history: earlier,
  done: { name: 'option:reviewed', key: adoptedOption },
  timeline: [
    ...opening(posts.prRequested),
    ...reviewPosts,
  ],
  tabs: [
    agentTab(agentTabKey),
    {
      key: prTabKey,
      kind: 'pr',
      title: adrPrTitle,
      label: 'プルリクエスト',
      url: 'https://code.internal.example/clinic/clinic-api/pull/1',
      favicon: { tone: 'ink', shape: 'circle' },
      initial: false,
      config: {
        owner: 'clinic',
        name: 'clinic-api',
        number: 1,
        title: adrPrTitle,
        status: 'Open',
        review: {
          file: 'docs/adr/1-cancel-record.md',
          author: 'you',
          reviewer: 'colleague',
          documentTitle: 'ADR 1: キャンセルの記録を、来院の更新と同じトランザクションで追記する',
          pendingTitle: 'キャンセルの記録を、どこに、どう残すか',
          draftLabel: 'コーディングエージェントが作成した叩き台',
          description: 'キャンセルの記録の残し方を決める ADR です。決定は「{name}」です。',
          changeCommit: '決定を「{name}」に変更',
          appendCommit: '決定と結果を追記',
          comments: adrReviews,
        },
      },
    },
  ],
  agent: {
    brand: 'Coding Agent',
    session: 'キャンセルの記録の ADR',
    stepDelayMs: 800,
    decision: {
      request: 'キャンセルの記録をどう残すかを決めたいです。ADR の叩き台を作ってください。',
      drafting:
        'ADR の叩き台を作ります。背景には、来院を誰が、なぜキャンセルしたのかという問い合わせに、回答できなかった経緯を書きます。',
      listing: '記録の残し方の案を6つ挙げました。それぞれの利点と欠点を書いています。',
      asking:
        'どの案を採用するかは、何を優先するかで決まります。優先することを決めるのは、チームです。どの案にしますか。',
      choose: 'この案にする',
      options: cancelRecordOptions.map(({ id, name, merit, demerit, sequence }) => ({
        id,
        name,
        merit,
        demerit,
        sequence,
      })),
      adopted: adoptedOption,
      first: {
        you: '「{name}」にします。',
        agent: '「{name}」を決定として ADR に書き、プルリクエストを作成しました。同僚にレビューを依頼しています。',
      },
      again: {
        you: '「{name}」に変更します。',
        agent: '決定を「{name}」に書き換えて、プルリクエストを更新しました。もう一度レビューを依頼しています。',
      },
      changesRequested:
        'プルリクエストが Changes requested になりました。同僚のコメントを確認して、別の案を選んでください。',
      approved: 'プルリクエストが Approved になりました。ADR に、決定と結果を追記しました。',
    },
  },
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
  history: [...earlier, posts.prRequested],
  timeline: opening(posts.tableRecord),
  tabs: [
    docTab('memo', 'ADR 2: 出来事ごとの記録を、1つのテーブルにまとめる', 'adr/2-record-table', true),
    docTab('explain', '3つの列を関数にたとえる', 'notes/columns-as-function'),
  ],
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
      url: 'https://code.internal.example/clinic/clinic-api/pull/2',
      favicon: { tone: 'ink', shape: 'circle' },
      config: {
        owner: 'clinic',
        name: 'clinic-api',
        number: 2,
        title: 'キャンセルの記録を足す',
        status: 'Open',
        diff: { file: 'visits.ts', before: 'chapter-1-start', after: 'chapter-2-step-2', context: 3 },
      },
    },
  ],
});
