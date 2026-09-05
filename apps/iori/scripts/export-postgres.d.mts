export const APPLICATION_TABLE_ORDER: readonly string[];

export interface PostgresExportManifest {
  schemaVersion: number;
  exportedAt: string;
  complete: boolean;
  tables: Record<string, { file: string; count: number; checksum: string }>;
}

export function exportPostgres(input: {
  connectionString: string;
  outputDir: string;
  queueDrained?: boolean;
  now?: () => Date;
  createClient?: () => Promise<{
    connect(): Promise<void>;
    end(): Promise<void>;
    query(sql: string): Promise<{ rows: readonly { row: unknown }[] }>;
  }>;
}): Promise<PostgresExportManifest>;
