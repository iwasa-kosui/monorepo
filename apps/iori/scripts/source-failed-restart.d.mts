export function runFailedSourceRestart(input: { sha: string; runId: string; restartRunId: string }, options?: {
  home?: string;
  uid?: number;
  signal?: AbortSignal;
  captureOutput?: (output: { stdout: string; stderr: string }) => Promise<void>;
  guard?: (input: { home: string; uid: number }) => Promise<void>;
  runCommand?: (program: string, args: string[], options: object) => Promise<{ stdout: string; stderr: string }>;
}): Promise<void>;
