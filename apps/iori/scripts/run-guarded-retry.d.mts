export function classifyFailure(output: string): 'authentication' | 'network' | 'other';

export function runGuardedWithRetry(input: {
  command: string;
  args: readonly string[];
  attempts?: number;
  delaysMs?: readonly number[];
  tailLines?: number;
  sleep?: (ms: number) => Promise<unknown>;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}): Promise<number>;
