import type { Post, TabDefinition, TableInfo, WorkspaceScenario } from '../../workspace/scenario';
import { docTab, editorTab, lessonScenario, opening, posts, replyButton } from './common';

const overviewPosts: readonly Post[] = [
  posts.otherTeams,
  posts.threeConsultations,
  posts.pastExperience,
  posts.closestQuestion,
];

const businessEvents: TableInfo = {
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
};

const visitsWithoutDate: TableInfo = {
  name: 'visits',
  columns: [
    { name: 'id', type: 'TEXT' },
    { name: 'pet_name', type: 'TEXT' },
    { name: 'status', type: 'TEXT' },
  ],
};

const summaryTableSql = `SELECT
  c.visit_date,
  c.cancelled_count AS recorded_count,
  (
    SELECT count(*) FROM business_events AS e
    WHERE e.event_name = 'VisitCancelled' AND e.target_state ->> '$.visit_date' = c.visit_date
  ) AS recalculated_count
FROM daily_cancellation_counts AS c;`;

const externalSyncSql = `SELECT
  received.target_id AS visit_id,
  received.event_at AS received_at,
  received.payload ->> '$.operatedAt' AS operated_at,
  received.payload ->> '$.reason' AS cancel_reason,
  outcome.event_name AS result,
  outcome.payload ->> '$.reason' AS rejected_reason
FROM business_events AS received
JOIN business_events AS outcome
  ON outcome.payload ->> '$.receivedEventId' = received.event_id
WHERE received.event_name = 'ExternalCancellationReceived'
ORDER BY received.event_id;`;

const auditLogSql = `SELECT
  a.id AS audit_log_id,
  a.row_id,
  a.old_value,
  a.new_value,
  a.operated_by,
  a.operated_at
FROM audit_logs AS a
LEFT JOIN business_events AS e ON e.payload ->> '$.auditLogId' = a.id
WHERE e.event_id IS NULL
ORDER BY a.id;`;

type Pattern = {
  readonly exercise: string;
  readonly script: string;
  readonly storageId: string;
  readonly initialSql: string;
  readonly tables: readonly TableInfo[];
};

const consoleTab = (pattern: Pattern): TabDefinition => ({
  key: 'console',
  kind: 'console',
  title: 'DB Console',
  label: 'DB コンソール',
  url: 'https://db.internal.example/console',
  favicon: { tone: 'teal', shape: 'circle' },
  config: {
    storageId: pattern.storageId,
    initialSql: pattern.initialSql,
    connection: { name: 'clinic_production（read-write）', engine: 'SQLite' },
    setup: { kind: 'script', exercise: pattern.exercise, entry: pattern.script, tables: pattern.tables },
    controls: true,
  },
});

const replyReason = 'エディタで確認用スクリプトを実行すると返信できます。';

type Consultation = {
  readonly id: string;
  readonly label: string;
  readonly history: readonly Post[];
  readonly opened: readonly Post[];
  readonly answer: Post;
  readonly thanks: Post;
  readonly doc: { readonly title: string; readonly path: string };
  readonly pattern: Pattern;
  readonly thanksDelay?: number;
  readonly laterPosts?: readonly { readonly post: Post; readonly delay: number; readonly addTab?: string }[];
  readonly extraTabs?: readonly TabDefinition[];
};

const consultation = (options: Consultation): WorkspaceScenario =>
  lessonScenario({
    id: options.id,
    label: options.label,
    history: options.history,
    timeline: opening(...options.opened),
    buttons: replyButton('返信する'),
    gates: {
      reply: {
        requires: [{ signal: 'code:run', reason: replyReason }],
        reasons: { all: replyReason, several: replyReason },
      },
    },
    reply: {
      lines: [{ text: options.answer.text }],
      followUps: [
        { actor: options.thanks.actor, delay: options.thanksDelay ?? 1.2, text: options.thanks.text },
        ...(options.laterPosts ?? []).map(({ post, delay, addTab }) => ({
          actor: post.actor,
          delay,
          text: post.text,
          ...(post.channel === undefined ? {} : { channel: post.channel }),
          ...(addTab === undefined ? {} : { addTab }),
        })),
      ],
    },
    tabs: [
      docTab('memo', options.doc.title, options.doc.path),
      editorTab('editor', 'visits.ts', { snapshot: options.pattern.exercise }),
      consoleTab(options.pattern),
      ...(options.extraTabs ?? []),
    ],
  });

const summaryTable: Pattern = {
  exercise: 'chapter-4-summary-table-done',
  script: 'why-this-count.ts',
  storageId: 'chapter-4-summary-table',
  initialSql: summaryTableSql,
  tables: [
    {
      name: 'visits',
      columns: [
        { name: 'id', type: 'TEXT' },
        { name: 'pet_name', type: 'TEXT' },
        { name: 'status', type: 'TEXT' },
        { name: 'visit_date', type: 'TEXT' },
      ],
    },
    businessEvents,
    {
      name: 'daily_cancellation_counts',
      columns: [
        { name: 'visit_date', type: 'TEXT' },
        { name: 'cancelled_count', type: 'INTEGER' },
      ],
    },
  ],
};

const externalSync: Pattern = {
  exercise: 'chapter-4-external-sync-done',
  script: 'what-was-imported.ts',
  storageId: 'chapter-4-external-sync',
  initialSql: externalSyncSql,
  tables: [visitsWithoutDate, businessEvents],
};

const auditLog: Pattern = {
  exercise: 'chapter-4-audit-log-done',
  script: 'why-changed.ts',
  storageId: 'chapter-4-audit-log',
  initialSql: auditLogSql,
  tables: [
    visitsWithoutDate,
    businessEvents,
    {
      name: 'audit_logs',
      columns: [
        { name: 'id', type: 'INTEGER' },
        { name: 'table_name', type: 'TEXT' },
        { name: 'row_id', type: 'TEXT' },
        { name: 'column_name', type: 'TEXT' },
        { name: 'old_value', type: 'TEXT' },
        { name: 'new_value', type: 'TEXT' },
        { name: 'operated_by', type: 'TEXT' },
        { name: 'operated_at', type: 'TEXT' },
      ],
    },
  ],
};

const financeExchange: readonly Post[] = [
  posts.financeGreeting,
  posts.financeAsked,
  posts.financeAnswer,
  posts.financeThanks,
];
const siteExchange: readonly Post[] = [
  posts.siteGreeting,
  posts.siteAsked,
  posts.siteAnswer,
  posts.siteThanks,
];
const auditExchange: readonly Post[] = [
  posts.auditGreeting,
  posts.auditAsked,
  posts.auditAnswer,
  posts.auditThanks,
];
const comparisonPosts: readonly Post[] = [posts.comparisonMade, posts.chooseOne];

export const chapter4Overview: WorkspaceScenario = lessonScenario({
  id: 'chapter-4-overview',
  label: '3つの相談を、普段の業務で運用しているシステムに近いかを考えながら見る',
  history: [posts.tamaAsked, posts.tamaAnswer, posts.tamaAcknowledged],
  timeline: opening(...overviewPosts),
  tabs: [docTab('memo', '相談の一覧', 'consultations/list')],
});

export const chapter4SummaryTable: WorkspaceScenario = consultation({
  id: 'chapter-4-summary-table',
  label: '集計の件数と、記録から数えた件数が合わない',
  history: overviewPosts,
  opened: [posts.financeGreeting, posts.financeAsked],
  answer: posts.financeAnswer,
  thanks: posts.financeThanks,
  doc: { title: '相談1: 集計の件数が合わない', path: 'consultations/summary-table' },
  pattern: summaryTable,
  laterPosts: [
    { post: posts.migrateOldData, delay: 4.5 },
    { post: posts.migrationRecord, delay: 1.0, addTab: 'adr' },
  ],
  extraTabs: [
    {
      ...docTab(
        'adr',
        'ADR 3: 業務イベントを導入する前のデータを、移行用のイベントとして取り込む',
        'adr/3-migrate-existing-data',
        true,
      ),
      initial: false,
    },
  ],
});

export const chapter4ExternalSync: WorkspaceScenario = consultation({
  id: 'chapter-4-external-sync',
  label: '予約サイトのキャンセルが反映されたか分からない',
  history: financeExchange,
  opened: [posts.siteGreeting, posts.siteAsked],
  answer: posts.siteAnswer,
  thanks: posts.siteThanks,
  doc: { title: '相談2: 予約サイトのキャンセルが反映されたか分からない', path: 'consultations/external-sync' },
  pattern: externalSync,
  thanksDelay: 0.6,
  laterPosts: [{ post: posts.externalSyncMigration, delay: 4.5 }],
});

export const chapter4AuditLog: WorkspaceScenario = consultation({
  id: 'chapter-4-audit-log',
  label: '監査ログに変更の理由がない',
  history: siteExchange,
  opened: [posts.auditGreeting, posts.auditAsked],
  answer: posts.auditAnswer,
  thanks: posts.auditThanks,
  doc: { title: '相談3: 監査ログに理由がない', path: 'consultations/audit-log' },
  pattern: auditLog,
  laterPosts: [{ post: posts.auditLogMigration, delay: 4.5 }],
});

export const chapter4Compare: WorkspaceScenario = lessonScenario({
  id: 'chapter-4-compare',
  label: '3つのパターンを表で比べて、普段の業務で運用しているシステムに近いものを1つ選ぶ',
  history: auditExchange,
  timeline: opening(...comparisonPosts),
  tabs: [docTab('memo', '3つのパターンの比較', 'consultations/comparison')],
});

const startTab = (key: string, exercise: string, title: string): TabDefinition =>
  editorTab(key, 'visits.ts', { snapshot: exercise }, { title, directory: `clinic-api/${exercise}` });

export const chapter4Takeaway: WorkspaceScenario = lessonScenario({
  id: 'chapter-4-takeaway',
  label: '選んだパターンを持ち帰って実装する',
  history: comparisonPosts,
  timeline: opening(posts.takeHome, posts.startingCodes),
  tabs: [
    docTab('guide', '持ち帰りの演習', 'guides/takeaway'),
    startTab(
      'summary-table',
      'chapter-4-summary-table-start',
      '集計テーブル（chapter-4-summary-table-start）',
    ),
    startTab(
      'external-sync',
      'chapter-4-external-sync-start',
      '外部システム同期（chapter-4-external-sync-start）',
    ),
    startTab(
      'audit-log',
      'chapter-4-audit-log-start',
      '既存の監査ログ（chapter-4-audit-log-start）',
    ),
  ],
});
