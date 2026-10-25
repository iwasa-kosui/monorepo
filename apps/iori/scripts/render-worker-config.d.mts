export const workerConfigTokens: readonly string[];

export const renderWorkerConfig: (input: {
  template: string;
  values: Record<string, string>;
}) => string;

export const writeWorkerConfig: (input: {
  template: string;
  values: Record<string, string>;
  outputDirectory: string;
}) => Promise<string>;

export const createTemporaryWorkerConfig: (input: {
  template: string;
  values: Record<string, string>;
  transform?: (rendered: string) => string;
}) => Promise<{ path: string; cleanup: () => Promise<void> }>;
