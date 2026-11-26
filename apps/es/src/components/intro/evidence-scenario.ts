import type { Condition, SignalRef, TabDefinition, WorkspaceScenario } from '../../workspace/scenario';
import { inquiry, lessonScenario, whyNotRecorded } from '../chapters/common';
import { earlierLogs, startedAt } from './incident-scenario';

const visitsSql = (status: string): string =>
  `CREATE TABLE visits (
  id TEXT PRIMARY KEY,
  pet_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'checked_in', 'completed', 'cancelled'))
);
INSERT INTO visits (id, pet_name, status) VALUES
  ('visit-pochi', 'ポチ', '${status}'),
  ('visit-tama', 'タマ', '${status}');`;

export const currentVisitsSql = visitsSql('cancelled');

export const restoredVisitsSql = visitsSql('reserved');

const logOpened: SignalRef = 'log:target-opened';
const consoleSelected: SignalRef = { name: 'tab:selected', key: 'console' };
const restoredQueried: SignalRef = { name: 'sql:executed', key: 'restored' };
const bothFound: Condition = { all: [logOpened, restoredQueried] };

const tabs: readonly TabDefinition[] = [
  {
    key: 'logs',
    kind: 'logs',
    title: 'アクセスログ',
    label: 'ログの検索',
    url: 'https://logs.internal.example/logs',
    favicon: { tone: 'violet', shape: 'square' },
    seen: logOpened,
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
];

export const evidenceScenario: WorkspaceScenario = {
  ...lessonScenario({
    id: 'intro-evidence',
    label: '来院のキャンセル理由の調査',
    tabs,
    history: [inquiry, whyNotRecorded],
    memo: {
      title: '調査メモ',
      unknown: 'まだ分からない',
      items: [
        { key: 'who', label: '誰が', text: 'どこにも残っていない', result: 'missing', fill: bothFound },
        { key: 'when', label: 'いつ', text: '2026-11-06 18:11:58', result: 'found', fill: logOpened },
        { key: 'what', label: '何を', text: 'reserved から cancelled', result: 'found', fill: restoredQueried },
        { key: 'why', label: 'なぜ', text: 'どこにも残っていない', result: 'missing', fill: bothFound },
      ],
    },
    done: bothFound,
  }),
  startedAt,
};
