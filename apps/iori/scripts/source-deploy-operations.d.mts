export function runSourceDeployStep(input: { phase: string; sha: string }, options?: {
  home?: string;
  uid?: number;
  signal?: AbortSignal;
  guard?: (input: { home: string; uid: number }) => Promise<void>;
  inspectCheckout?: (home: string, uid: number) => Promise<void>;
  runCommand?: (program: string, args: string[], options: object) => Promise<{ stdout: string; stderr: string }>;
}): Promise<void>;
