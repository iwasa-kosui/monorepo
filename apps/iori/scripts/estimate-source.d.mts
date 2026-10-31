import type { createSourceSshAdapter } from './source-control-ssh.mjs';
export function estimateSource(
  options: {
    source: Pick<Awaited<ReturnType<typeof createSourceSshAdapter>>, 'estimate'>;
    availableBytes: number | bigint;
    signal?: AbortSignal;
  },
): Promise<string>;
