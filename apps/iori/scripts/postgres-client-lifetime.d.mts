import type { PostgresExportClient } from './export-postgres-lib.mjs';
export function guardPostgresClient(client: PostgresExportClient, parentSignal?: AbortSignal): {
  signal: AbortSignal;
  close(): Promise<void>;
  cleanup(): Promise<void>;
};
