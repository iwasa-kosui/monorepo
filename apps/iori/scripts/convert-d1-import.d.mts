export function convertD1Import(input: {
  manifestPath: string;
  schemaPath: string;
  outputDir: string;
  maxFileBytes?: number;
  signal?: AbortSignal;
}): Promise<string[]>;

export const D1_STATEMENT_BYTES: number;
