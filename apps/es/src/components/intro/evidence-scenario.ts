import type {
  Condition,
  EarlierLog,
  Post,
  SignalRef,
  TabDefinition,
  WorkspaceScenario,
} from '../../workspace/scenario';
import { devChannel, documentTab, inquiry, lessonScenario, opening, whyNotRecorded } from '../chapters/common';

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

const consoleShown: SignalRef = 'sql:target-shown';
const logsSelected: SignalRef = { name: 'tab:selected', key: 'logs' };
const explainSelected: SignalRef = { name: 'tab:selected', key: 'explain' };
const restoredQueried: SignalRef = { name: 'sql:executed', key: 'restored' };
const bothFound: Condition = { all: [logsSelected, restoredQueried] };

const request = (
  time: string,
  path: string,
  duration: number,
): EarlierLog => ({ time: `2026-11-09T${time}Z`, level: 'INFO', method: 'GET', path, status: 200, duration });

export const recentLogs: readonly EarlierLog[] = [
  request('09:16:08.412', '/visits', 8),
  request('09:19:33.057', '/visits/visit-tama', 5),
  request('09:21:47.690', '/visits', 7),
  request('09:24:02.318', '/visits/visit-pochi', 6),
  request('09:27:51.144', '/visits', 9),
  request('09:29:16.803', '/visits/visit-pochi', 5),
];

const support = (text: string): Post => ({ actor: 'support', text });

export const anotherInquiry = support('お疲れ様です！先週のポチちゃんの件で、病院さんからもう1つ聞かれてます🙏');

export const checkInInquiry = support(
  'ポチちゃんの来院（visit-pochi）、受付したのは3ヶ月くらい前らしいんですが、いつ誰が受付したか、わかりますか？',
);

const colleague = (text: string): Post => ({ actor: 'colleague', channel: devChannel, text });

export const accessLogArchive = colleague(
  '3ヶ月前のログは、ここには出てこないです。一週間以上前のアクセスログは、S3 Glacier Deep Archive に退避してあります。読み取りを滅多にしない想定のストレージクラスなので、ダウンロードにむっちゃ時間がかかります。標準の取り出しで、通常 12 時間以内です',
);

export const accessLogLimit = colleague(
  '取り出しても、アクセスログで分かるのは、受付の API が呼ばれた日時までです。IP と User-Agent は載ってますが、誰が呼んだのかは載ってないです',
);

export const backupRestoreLimit = colleague(
  'バックアップを復元すると、受付済みになった時期は確かめられます。8月1日のバックアップは予約済みで、9月1日は受付済みなので、その間です。ただ、復元はとても時間がかかりますし、バックアップ間隔の間に起きたことは分からないです',
);

export const backupLimit = colleague(
  'しかも、戻るのは残っていた値だけです。誰が変えたのかは、残してなければどこにも無いです',
);

const tabs: readonly TabDefinition[] = [
  {
    key: 'console',
    kind: 'console',
    title: 'DB',
    label: 'DB コンソール',
    url: 'https://db.internal.example/console',
    favicon: { tone: 'teal', shape: 'circle' },
    seen: consoleShown,
    note: 'いまの状態だけが入っています。',
    config: {
      storageId: 'intro-evidence-console',
      initialSql: 'SELECT * FROM visits;',
      connection: { name: 'clinic_production（read-write）', engine: 'SQLite' },
      setup: { kind: 'sql', sql: currentVisitsSql },
      target: { column: 'status', value: 'visit-pochi' },
    },
  },
  {
    key: 'logs',
    kind: 'logs',
    title: 'アクセスログ',
    label: 'ログの検索',
    url: 'https://logs.internal.example/logs',
    favicon: { tone: 'violet', shape: 'square' },
    seen: logsSelected,
    note:
      '7日より前のログは、S3 Glacier Deep Archive にアーカイブしています。復元は、標準取り出しで通常 12 時間以内に完了します。',
    config: {
      service: 'clinic-api',
      host: 'clinic-api-1',
      client: { ip: '10.0.3.21', userAgent: 'Mozilla/5.0' },
      earlier: recentLogs,
      rules: [],
      visibleFromMinutes: 15,
      rail: [false, false, true, false, false],
      initialQuery: 'service:clinic-api',
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
      updatedAt: '2026-11-09',
      updatedBy: '同僚',
    }),
    initial: false,
    seen: explainSelected,
  },
];

export const evidenceScenario: WorkspaceScenario = lessonScenario({
  id: 'intro-evidence',
  label: '3ヶ月前の受付の調査',
  tabs,
  history: [inquiry, whyNotRecorded],
  timeline: [
    ...opening(anotherInquiry, checkInInquiry),
    { when: 'tab:selected', key: 'logs', kind: 'post', post: accessLogArchive },
    { when: 'tab:selected', key: 'logs', kind: 'post', post: accessLogLimit, delay: 6 },
    { when: 'tab:selected', key: 'logs', kind: 'tab', tab: 'explain', action: 'add' },
    { when: 'sql:executed', key: 'restored', kind: 'post', post: backupRestoreLimit },
    { when: 'sql:executed', key: 'restored', kind: 'post', post: backupLimit, delay: 6 },
    { when: 'sql:executed', key: 'restored', kind: 'tab', tab: 'explain', action: 'add' },
  ],
  memo: {
    title: '調査メモ',
    unknown: 'まだ分からない',
    items: [
      { key: 'who', label: '誰が', text: 'どこにも残っていない', result: 'missing', fill: bothFound },
      { key: 'when', label: 'いつ', text: '8月1日から9月1日の間', result: 'found', fill: restoredQueried },
      { key: 'what', label: '何を', text: '予約済みから受付済み', result: 'found', fill: restoredQueried },
    ],
  },
  done: { all: [consoleShown, logsSelected, restoredQueried] },
});
