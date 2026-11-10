export function runMigrationCommand(
  program: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeout: number;
    maxBuffer: number;
    signal?: AbortSignal;
    captureOutput?: (output: { stdout: string; stderr: string }) => Promise<void>;
    killGraceMs?: number;
    input?: string | Uint8Array;
  },
): Promise<{ stdout: string; stderr: string }>;
