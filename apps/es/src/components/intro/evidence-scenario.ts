import type { Condition, Post, SignalRef, TabDefinition, WorkspaceScenario } from '../../workspace/scenario';
import { devChannel, documentTab, inquiry, lessonScenario, whyNotRecorded } from '../chapters/common';
import { earlierLogs, startedAt } from './incident-scenario';

const visitsSql = (pochi: string, tama: string): string =>
  `CREATE TABLE visits (
  id TEXT PRIMARY KEY,
  pet_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'checked_in', 'completed', 'cancelled'))
);
INSERT INTO visits (id, pet_name, status) VALUES
  ('visit-pochi', 'ポチ', '${pochi}'),
  ('visit-tama', 'タマ', '${tama}');`;

export const currentVisitsSql = visitsSql('cancelled', 'cancelled');

export const backups: readonly { readonly label: string; readonly sql: string }[] = [
  { label: '2026-06-01 00:00', sql: visitsSql('reserved', 'reserved') },
  { label: '2026-07-01 00:00', sql: visitsSql('reserved', 'reserved') },
  { label: '2026-08-01 00:00', sql: visitsSql('reserved', 'reserved') },
  { label: '2026-09-01 00:00', sql: visitsSql('checked_in', 'reserved') },
  { label: '2026-10-01 00:00', sql: visitsSql('checked_in', 'reserved') },
  { label: '2026-11-01 00:00', sql: visitsSql('checked_in', 'reserved') },
];

const logOpened: SignalRef = 'log:target-opened';
const consoleSelected: SignalRef = { name: 'tab:selected', key: 'console' };
const explainSelected: SignalRef = { name: 'tab:selected', key: 'explain' };
const restoredQueried: SignalRef = { name: 'sql:executed', key: 'restored' };
const bothFound: Condition = { all: [logOpened, restoredQueried] };

const lead = (text: string): Post => ({ actor: 'techlead', channel: devChannel, text, time: '18:25' });

export const accessLogLimit = lead(
  'アクセスログで分かるのは、キャンセルの API が 18:11:58 に呼ばれたことまでです。IP と User-Agent は載ってますが、誰が呼んだのかと理由は載ってないです',
);

export const backupLimit = lead(
  'バックアップを復元すると、status が予約済みから受付済み、キャンセル済みの順に変わったことは分かります。ただ、戻るのは残っていた値だけです。誰がなぜ変えたのかは、残してなければどこにも無いです',
);

export const backupRestoreLimit = lead(
  'キャンセル済みになった日時は分かります。受付済みになった日時も、バックアップから復元すれば確かめられます。8月1日のバックアップは予約済みで、9月1日は受付済みなので、その間です。ただ、復元はとても時間がかかりますし、バックアップ間隔の間に起きたことは分からないです',
);

export const accessLogArchive = lead(
  '一週間以上前のアクセスログは、S3 Glacier Deep Archive に退避してあります。読み取りを滅多にしない想定のストレージクラスなので、ダウンロードにむっちゃ時間がかかります。標準の取り出しで、通常 12 時間以内です',
);

const tabs: readonly TabDefinition[] = [
  {
    key: 'logs',
    kind: 'logs',
    title: 'アクセスログ',
    label: 'ログの検索',
    url: 'https://logs.internal.example/logs',
    favicon: { tone: 'violet', shape: 'square' },
    seen: logOpened,
    note:
      '7日より前のログは、S3 Glacier Deep Archive にアーカイブしています。復元は、標準取り出しで通常 12 時間以内に完了します。',
    config: {
      service: 'clinic-api',
      host: 'clinic-api-1',
      client: { ip: '10.0.3.21', userAgent: 'Mozilla/5.0' },
      earlier: earlierLogs,
      rules: [],
      visibleFromMinutes: 15,
      rail: [false, false, true, false, false],
      initialQuery: 'service:clinic-api',
      target: { method: 'POST', path: '/visits/visit-pochi/cancel' },
    },
  },
  {
    key: 'console',
    kind: 'console',
    title: 'DB',
    label: 'DB コンソール',
    url: 'https://db.internal.example/console',
    favicon: { tone: 'teal', shape: 'circle' },
    seen: consoleSelected,
    config: {
      storageId: 'intro-evidence-console',
      initialSql: 'SELECT * FROM visits;',
      connection: { name: 'clinic_production（read-write）', engine: 'SQLite' },
      setup: { kind: 'sql', sql: currentVisitsSql },
    },
  },
  {
    key: 'backup',
    kind: 'slot',
    title: '定期バックアップ',
    label: '画面',
    url: 'https://backup.internal.example/restore',
    favicon: { tone: 'blue', shape: 'rounded' },
    seen: restoredQueried,
  },
  {
    ...documentTab('explain', '解説', 'notes/access-log-and-db-backup', {
      title: 'アクセスログとDBバックアップでは何が解決できないのか',
      updatedAt: '2026-11-06',
      updatedBy: 'テックリード',
    }),
    initial: false,
    seen: explainSelected,
  },
];

export const evidenceScenario: WorkspaceScenario = {
  ...lessonScenario({
    id: 'intro-evidence',
    label: '来院のキャンセル理由の調査',
    tabs,
    history: [inquiry, whyNotRecorded],
    timeline: [
      { when: 'log:target-opened', kind: 'post', post: accessLogLimit },
      { when: 'log:target-opened', kind: 'post', post: accessLogArchive, delay: 6 },
      { when: 'log:target-opened', kind: 'tab', tab: 'explain', action: 'add' },
      { when: 'sql:executed', key: 'restored', kind: 'post', post: backupLimit },
      { when: 'sql:executed', key: 'restored', kind: 'post', post: backupRestoreLimit, delay: 6 },
      { when: 'sql:executed', key: 'restored', kind: 'tab', tab: 'explain', action: 'add' },
    ],
    memo: {
      title: '調査メモ',
      unknown: 'まだ分からない',
      items: [
        { key: 'who', label: '誰が', text: 'どこにも残っていない', result: 'missing', fill: bothFound },
        { key: 'when', label: 'いつ', text: '2026-11-06 18:11:58', result: 'found', fill: logOpened },
        {
          key: 'what',
          label: '何を',
          text: '予約済み、受付済み、キャンセル済みの順',
          result: 'found',
          fill: restoredQueried,
        },
        { key: 'why', label: 'なぜ', text: 'どこにも残っていない', result: 'missing', fill: bothFound },
      ],
    },
    done: bothFound,
  }),
  startedAt,
};
