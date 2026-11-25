import { whoCancelledSql } from '../../lib/snapshots';
import { sceneSteps } from '../../playground/scene-steps';
import type { MemoItem, Post, WorkspaceScenario } from '../../workspace/scenario';
import { answeredThanks, docTab, inquiry, lessonScenario, opening, posts, replyButton, whyNotRecorded } from './common';

const answered: readonly Post[] = [
  inquiry,
  whyNotRecorded,
  posts.otherClinicFirst,
  posts.otherClinicSecond,
  posts.staffReply,
  answeredThanks,
];

const targetShown = 'sql:target-shown' as const;

const memoItem = (
  key: string,
  label: string,
  read: NonNullable<MemoItem['read']>,
): MemoItem => ({ key, label, text: '結果から読みます', result: 'found', fill: targetShown, read });

export const chapter3Answer: WorkspaceScenario = lessonScenario({
  id: 'chapter-3-answer',
  label: '記録から、誰がなぜキャンセルしたかを答える',
  history: [inquiry, whyNotRecorded],
  timeline: opening(posts.otherClinicFirst, posts.otherClinicSecond),
  buttons: replyButton('調査結果を返信する'),
  memo: {
    title: '返信の下書き（調査メモ）',
    unknown: '結果を確認してください',
    items: [
      memoItem('who', '誰が', { signal: targetShown, field: 'operated_by' }),
      memoItem('when', 'いつ', { signal: targetShown, field: 'event_at', format: 'datetime' }),
      memoItem('what', '何を', {
        signal: targetShown,
        field: 'event_name',
        labels: { VisitCancelled: '来院のキャンセル' },
      }),
      memoItem('why', 'なぜ', { signal: targetShown, field: 'reason' }),
    ],
  },
  gates: {
    reply: {
      requires: [{
        signal: targetShown,
        reason: 'SQL を実行して、visit-pochi の行の結果を表示すると返信できます。',
      }],
      reasons: {
        all: 'SQL を実行して、visit-pochi の行の結果を表示すると返信できます。',
        several: 'SQL を実行して、visit-pochi の行の結果を表示すると返信できます。',
      },
    },
  },
  reply: {
    lines: [{ text: '{operated_by}が、{reason}でキャンセルしてます（{event_at}）' }],
    from: { signal: targetShown, formats: { event_at: 'datetime' } },
    followUps: [{ actor: 'support', delay: 1.2, text: answeredThanks.text }],
  },
  tabs: [
    {
      key: 'console',
      kind: 'console',
      title: 'DB Console',
      label: 'DB コンソール',
      url: 'https://db.internal.example/console',
      favicon: { tone: 'teal', shape: 'circle' },
      config: {
        storageId: 'chapter-3-who-cancelled',
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
        target: {
          column: 'operated_by',
          value: 'visit-pochi',
          read: ['event_at', 'event_name', 'operated_by', 'reason'],
        },
        controls: true,
      },
    },
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
  gates: {
    reply: {
      requires: [{
        signal: { name: 'figure:step', key: 'last' },
        reason: '図を最後まで進めると返信できます。',
      }],
      reasons: {
        all: '図を最後まで進めると返信できます。',
        several: '図を最後まで進めると返信できます。',
      },
    },
  },
  reply: {
    lines: [{ text: posts.tamaAnswer.text }],
    followUps: [{ actor: 'support', delay: 1.2, text: posts.tamaAcknowledged.text }],
  },
  tabs: [docTab('memo', '記録を足す前に起きたこと', 'guides/before-record')],
});
