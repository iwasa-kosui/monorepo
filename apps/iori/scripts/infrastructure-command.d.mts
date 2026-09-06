export type InfrastructureCommand = (program: string, args: string[], options: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}) =>
  | { status: number | null; stdout?: string; stderr?: string }
  | Promise<{ status: number | null; stdout?: string; stderr?: string }>;
export function runInfrastructureCommand(program: string, args: string[], options: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}): Promise<{ status: number; stdout: string; stderr: string }>;
