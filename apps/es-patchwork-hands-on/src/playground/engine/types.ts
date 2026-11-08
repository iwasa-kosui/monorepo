export type LogLine = { stream: 'stdout' | 'stderr'; text: string };

export type TestResult = {
  name: string;
  path: readonly string[];
  status: 'pass' | 'fail' | 'skipped';
  message: string | null;
};

export type RunOutcome = {
  logs: LogLine[];
  tests: TestResult[] | null;
  error: string | null;
};

export type SqlCell = string | number | null;

export type SqlStatementResult =
  | { kind: 'rows'; sql: string; columns: string[]; rows: SqlCell[][]; totalRows: number }
  | { kind: 'changes'; sql: string; changes: number }
  | { kind: 'done'; sql: string };

export type SqlRunOutcome = {
  results: SqlStatementResult[];
  error: { sql: string | null; message: string } | null;
};

export type WorkerRequest =
  | { id: number; type: 'sql-setup'; setupSql: string }
  | { id: number; type: 'sql-run'; sql: string }
  | { id: number; type: 'code-run'; files: Readonly<Record<string, string>>; entry: string };

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'init-error'; message: string }
  | { id: number; type: 'sql-setup'; error: string | null }
  | { id: number; type: 'sql-run'; outcome: SqlRunOutcome }
  | { id: number; type: 'code-run'; outcome: RunOutcome }
  | { id: number; type: 'failure'; message: string };
