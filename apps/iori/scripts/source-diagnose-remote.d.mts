export const activeStates: readonly string[];
export const subStates: readonly string[];
export const journalClasses: readonly string[];
export const sourceDiagnoseNoticeLine: RegExp;
export function parseSystemctlShow(
  text: string,
): { active: string; sub: string; restarts: number; exitStatus: number };
export function classifyJournal(text: string): string;
export function parseMemAvailableMegabytes(text: string): number;
export function parseSourceRevision(text: string): string;
export function formatSourceDiagnoseNotice(values: {
  active: string;
  sub: string;
  restarts: number;
  exitStatus: number;
  journal: string;
  freeze: number;
  freezePending: number;
  memAvailableMegabytes: number;
  diskFreeMegabytes: number;
  sourceRevision: string;
}): string;
export function runSourceDiagnosis(options?: {
  home?: string;
  meminfoPath?: string;
  signal?: AbortSignal;
  write?: (line: string) => void;
  runCommand?: (
    program: string,
    args: string[],
    options: { captureOutput?: (output: { stdout: string; stderr: string }) => Promise<void> },
  ) => Promise<{ stdout: string; stderr: string }>;
}): Promise<void>;
