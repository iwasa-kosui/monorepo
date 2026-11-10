export function putWorkerSecrets(options: {
  invocation: Readonly<{
    operation: string;
    codeSha: string;
    migrationSha: string;
    environment: string;
    generation: string;
    runId: string;
  }>;
  env: Record<string, string | undefined>;
  signal: AbortSignal;
  timeout: number;
  onStage?: (stage: string) => void;
  runCommand?: (
    program: string,
    args: string[],
    options: {
      cwd: string;
      env: NodeJS.ProcessEnv;
      timeout: number;
      maxBuffer: number;
      signal?: AbortSignal;
      killGraceMs?: number;
      input?: string | Uint8Array;
    },
  ) => Promise<{ stdout: string; stderr: string }>;
  fetchRequest?: typeof fetch;
  sleep?: (ms: number, signal: AbortSignal) => Promise<unknown>;
}): Promise<void>;
