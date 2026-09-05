import type { SourceSshOptions, SourceState } from './source-control-ssh.mjs';
export function sourceDeploymentSshArguments(
  options: Pick<SourceSshOptions, 'user' | 'identityFile' | 'knownHostsFile'>,
): string[];
export function deploySource(options: SourceSshOptions, dependencies?: {
  runCommand?: (
    program: string,
    args: string[],
    options: { input?: string; signal?: AbortSignal },
  ) => Promise<{ stdout: string; stderr: string }>;
  checkMain?: (sha: string, options: { signal?: AbortSignal }) => Promise<void>;
  sourceFactory?: (options: SourceSshOptions) => Promise<{ status(signal?: AbortSignal): Promise<SourceState> }>;
  inspectDist?: () => Promise<string>;
}): Promise<void>;
