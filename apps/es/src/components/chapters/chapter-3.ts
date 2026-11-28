import { whoCancelledSql } from '../../lib/snapshots';
import { sceneSteps } from '../../playground/scene-steps';
import type { GroundedReply, MemoItem, Post, TabDefinition, WorkspaceScenario } from '../../workspace/scenario';
import { answeredThanks, docTab, inquiry, lessonScenario, opening, posts, replyButton, whyNotRecorded } from './common';

const answered: readonly Post[] = [
  inquiry,
  whyNotRecorded,
  posts.otherClinicFirst,
  posts.otherClinicSecond,
  posts.staffReply,
  answeredThanks,
];

const rowSelected = 'sql:row-selected' as const;

const rowReason = '結果の表から、根拠にする行を選択すると返信できます。';

const cancelledLine = '{operated_by}が、{reason}でキャンセルしてます（{event_at}）';

const noRecord = 'この行には、キャンセルの記録が残ってないです…';

const memoItem = (
  key: string,
  label: string,
  read: Omit<NonNullable<MemoItem['read']>, 'signal' | 'absent'>,
): MemoItem => ({
  key,
  label,
  text: '結果から読みます',
  result: 'found',
  fill: rowSelected,
  read: { signal: rowSelected, absent: '記録なし', ...read },
});

const investigationMemo: NonNullable<WorkspaceScenario['memo']> = {
  title: '返信の下書き（調査メモ）',
  unknown: '結果の表から行を選択してください',
  items: [
    memoItem('who', '誰が', { field: 'operated_by' }),
    memoItem('when', 'いつ', { field: 'event_at', format: 'datetime' }),
    memoItem('what', '何を', { field: 'event_name', labels: { VisitCancelled: '来院のキャンセル' } }),
    memoItem('why', 'なぜ', { field: 'reason' }),
  ],
};

const rowGates: NonNullable<WorkspaceScenario['gates']> = {
  reply: {
    requires: [{ signal: rowSelected, reason: rowReason }],
    reasons: { all: rowReason, several: rowReason },
  },
};

const groundedReply = (target: string, challenge: string, incompleteChallenge?: string): GroundedReply => ({
  signal: rowSelected,
  column: 'id',
  target,
  needs: ['operated_by', 'reason', 'event_at'],
  line: cancelledLine,
  formats: { event_at: 'datetime' },
  missing: noRecord,
  challenge: { actor: 'support', delay: 0.6, text: challenge },
  ...(incompleteChallenge === undefined ? {} : { incomplete: { challenge: incompleteChallenge } }),
});

const whoCancelledConsole = (storageId: string): TabDefinition => ({
  key: 'console',
  kind: 'console',
  title: 'DB Console',
  label: 'DB コンソール',
  url: 'https://db.internal.example/console',
  favicon: { tone: 'teal', shape: 'circle' },
  config: {
    storageId,
    initialSql: whoCancelledSql(),
    connection: { name: 'clinic_production（read-write）', engine: 'SQLite' },
    setup: {
      kind: 'script',
      exercise: 'chapter-2-step-2',
      entry: 'who-cancelled.ts',
      own: { exercise: sceneSteps[2].storageId, file: 'visits.ts', testFile: 'visits.test.ts' },
      tables: [
        {
          name: 'visits',
          columns: [
            { name: 'id', type: 'TEXT' },
            { name: 'pet_name', type: 'TEXT' },
            { name: 'status', type: 'TEXT' },
          ],
        },
        {
          name: 'business_events',
          columns: [
            { name: 'event_id', type: 'INTEGER' },
            { name: 'event_at', type: 'TEXT' },
            { name: 'event_name', type: 'TEXT' },
            { name: 'payload', type: 'TEXT' },
            { name: 'target_id', type: 'TEXT' },
            { name: 'target_type', type: 'TEXT' },
            { name: 'target_state', type: 'TEXT' },
          ],
        },
      ],
    },
    controls: true,
    selectRows: true,
  },
});

export const chapter3Answer: WorkspaceScenario = lessonScenario({
  id: 'chapter-3-answer',
  label: '記録から、誰がなぜキャンセルしたかを答える',
  history: [inquiry, whyNotRecorded],
  timeline: opening(posts.otherClinicFirst, posts.otherClinicSecond),
  buttons: replyButton('調査結果を返信する'),
  memo: investigationMemo,
  gates: rowGates,
  reply: {
    lines: [{ text: cancelledLine }],
    from: { signal: rowSelected, formats: { event_at: 'datetime' } },
    grounded: groundedReply(
      'visit-pochi',
      'それはポチ（visit-pochi）の来院の行ですか？ id の列を見てもらえると助かります',
      '誰がなぜキャンセルしたかを知りたいです。その行から分かりますか？',
    ),
    followUps: [{ actor: 'support', delay: 0.6, text: answeredThanks.text }],
  },
  done: { name: 'chat:replied', key: 'grounded' },
  tabs: [
    whoCancelledConsole('chapter-3-who-cancelled'),
    docTab('guide', 'SQL の実行手順', 'guides/run-sql'),
  ],
});

export const chapter3Read: WorkspaceScenario = lessonScenario({
  id: 'chapter-3-read',
  label: 'SELECT の読み方',
  history: answered,
  tabs: [docTab('memo', 'who-cancelled.ts の SELECT', 'guides/who-cancelled-select')],
});

export const chapter3Table: WorkspaceScenario = lessonScenario({
  id: 'chapter-3-table',
  label: '結果の表の読み方',
  history: answered,
  tabs: [docTab('memo', '実行結果の読み方', 'guides/result-table')],
});

export const chapter3Before: WorkspaceScenario = lessonScenario({
  id: 'chapter-3-before',
  label: '記録を足す前にキャンセルされた来院には答えられない',
  history: answered,
  timeline: opening(posts.tamaAsked),
  buttons: replyButton('返信する'),
  memo: investigationMemo,
  gates: rowGates,
  reply: {
    lines: [{ text: posts.tamaAnswer.text }],
    grounded: groundedReply(
      'visit-tama',
      'それはポチの来院の記録ではないですか？ タマ（visit-tama）の方を知りたいです',
    ),
    followUps: [{ actor: 'support', delay: 0.6, text: posts.tamaAcknowledged.text, addTab: 'memo' }],
  },
  done: { name: 'chat:replied', key: 'grounded' },
  tabs: [
    whoCancelledConsole('chapter-3-who-cancelled-tama'),
    docTab('guide', 'SQL の実行手順', 'guides/run-sql'),
    { ...docTab('memo', '記録を足す前に起きたこと', 'guides/before-record'), initial: false },
  ],
});
