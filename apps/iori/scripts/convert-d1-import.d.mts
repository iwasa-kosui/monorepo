export function convertD1Import(input: {
  manifestPath: string;
  schemaPath: string;
  outputDir: string;
  maxFileBytes?: number;
}): Promise<string[]>;
