import type { createSourceSshAdapter } from './source-control-ssh.mjs';
export function estimateSource(
  options: {
    source: Pick<Awaited<ReturnType<typeof createSourceSshAdapter>>, 'estimate'>;
    availableBytes: number | bigint;
    signal?: AbortSignal;
  },
): Promise<string>;
export function estimateFromEnvironment(
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
  deps?: {
    createSource?: (options: Parameters<typeof createSourceSshAdapter>[0]) => ReturnType<typeof createSourceSshAdapter>;
    availableBytes?: (root: string) => Promise<number | bigint>;
  },
): Promise<string>;
