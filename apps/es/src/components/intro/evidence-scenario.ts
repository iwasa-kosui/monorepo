import type { TabDefinition, WorkspaceScenario } from '../../workspace/scenario';
import { lessonScenario } from '../chapters/common';
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

const tabs: readonly TabDefinition[] = [
  {
    key: 'logs',
    kind: 'logs',
    title: 'アクセスログ',
    label: 'ログの検索',
    url: 'https://logs.internal.example/logs',
    favicon: { tone: 'violet', shape: 'square' },
    config: {
      service: 'clinic-api',
      host: 'clinic-api-1',
      client: { ip: '10.0.3.21', userAgent: 'Mozilla/5.0' },
      earlier: earlierLogs,
      rules: [],
      visibleFromMinutes: 15,
      rail: [false, false, true, false, false],
      initialQuery: 'service:clinic-api',
    },
  },
  {
    key: 'console',
    kind: 'console',
    title: 'DB',
    label: 'DB コンソール',
    url: 'https://db.internal.example/console',
    favicon: { tone: 'teal', shape: 'circle' },
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
  },
];

export const evidenceScenario: WorkspaceScenario = {
  ...lessonScenario({
    id: 'intro-evidence',
    label: '来院のキャンセル理由の調査',
    tabs,
    collapsed: true,
  }),
  startedAt,
};
