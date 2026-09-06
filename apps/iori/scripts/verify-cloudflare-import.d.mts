export interface ImportObject {
  key: string;
  checksum?: string;
  contentType?: string;
  missing?: boolean;
}

export interface ImportState {
  tables?: Record<string, { count: number; checksum?: string }>;
  r2Keys?: readonly string[];
  ogpKeys?: readonly string[];
  r2Objects?: readonly ImportObject[];
  ogpObjects?: readonly ImportObject[];
}

export interface ExpectedProvider {
  loadExpected(): Promise<ImportState>;
}

export interface ObjectListPage {
  keys: readonly string[];
  cursor?: string;
}

export interface ActualProvider {
  loadActual(expected: ImportState): Promise<ImportState>;
}

export function verifyCloudflareImport(input: { expected: ImportState; actual: ImportState }): string[];
export function createManifestExpectedProvider(input: {
  exportManifestPath: string;
  d1ImportManifestPath?: string;
  uploadManifestPath?: string;
  ogpManifestPath?: string;
  signal?: AbortSignal;
}): ExpectedProvider;
export function createCloudflareActualProvider(input: {
  d1: { getTableSummaries(tables: readonly string[]): Promise<Record<string, { count: number; checksum?: string }>> };
  r2: {
    get(
      key: string,
    ): Promise<
      {
        body: Uint8Array | ReadableStream<Uint8Array> | { arrayBuffer(): Promise<ArrayBuffer> };
        httpMetadata?: { contentType?: string };
      } | null
    >;
    listObjects(prefix: string, cursor?: string): Promise<ObjectListPage>;
  };
}): ActualProvider;
export function createCloudflareImportProvider(input: {
  getTableSummaries(tables: readonly string[]): Promise<Record<string, { count: number; checksum?: string }>>;
  getObject(
    key: string,
  ): Promise<{ body: Uint8Array | ReadableStream<Uint8Array>; httpMetadata?: { contentType?: string } } | null>;
  listObjects(prefix: string, cursor?: string): Promise<ObjectListPage>;
}): ActualProvider;
export function verifyCloudflareImportWithProviders(input: {
  expectedProvider: ExpectedProvider;
  actualProvider: ActualProvider;
}): Promise<string[]>;
export function runVerificationCli(input: {
  expectedProvider: ExpectedProvider;
  actualProvider: ActualProvider;
  write?(line: string): void;
}): Promise<number>;
