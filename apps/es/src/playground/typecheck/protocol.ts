export type TypecheckDiagnostic = {
  from: number;
  to: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
};

export type TypecheckCompletion = {
  label: string;
  type: string;
  boost: number;
  apply?: string;
};

export type TypecheckQuickInfo = { from: number; to: number; text: string };

export type TypecheckRequest =
  | { type: 'init'; files: Record<string, string> }
  | { id: number; type: 'diagnostics'; file: string; text: string }
  | { id: number; type: 'completions'; file: string; text: string; position: number; trigger: string | null }
  | { id: number; type: 'quick-info'; file: string; text: string; position: number };

export type TypecheckResponse =
  | { type: 'ready' }
  | { type: 'init-error'; message: string }
  | { id: number; type: 'diagnostics'; result: TypecheckDiagnostic[] }
  | { id: number; type: 'completions'; result: TypecheckCompletion[] }
  | { id: number; type: 'quick-info'; result: TypecheckQuickInfo | null }
  | { id: number; type: 'error'; message: string };
