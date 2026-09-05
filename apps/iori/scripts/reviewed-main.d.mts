export function assertReviewedMain(sha: string, options?: {
  signal?: AbortSignal;
  runCommand?: (program: string, args: string[], options: object) => Promise<{ stdout: string; stderr: string }>;
}): Promise<void>;
