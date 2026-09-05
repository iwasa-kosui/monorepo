export const APPLICATION_TABLE_ORDER: readonly string[];
export const EXPORT_LIMITS: Readonly<{ rowBytes: number; pageRows: number; totalBytes: number; deadlineMs: number }>;
export type PostgresExportClient = {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(sql: string): Promise<{ rows: readonly { row?: unknown; [key: string]: unknown }[] }>;
};
export type PostgresExportManifest = {
  schemaVersion: number;
  exportedAt: string;
  complete: boolean;
  tables: Record<string, { file: string; count: number; bytes: number; checksum: string }>;
};
export function exportPostgres(input: {
  outputDir: string;
  createClient: () => Promise<PostgresExportClient>;
  now?: () => Date;
  pageSize?: number;
  sortChunkBytes?: number;
  signal?: AbortSignal;
  maxBytes?: number;
}): Promise<PostgresExportManifest>;
