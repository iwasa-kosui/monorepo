export function runMigrationCommand(
  program: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeout: number; maxBuffer: number; signal?: AbortSignal },
): Promise<{ stdout: string; stderr: string }>;
