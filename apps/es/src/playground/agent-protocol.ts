export type AgentStep = 1 | 2;

export type AgentTurn = Readonly<{ role: 'user' | 'assistant'; text: string }>;

export type TestFailure = Readonly<{ name: string; message: string }>;

export type TestReport = Readonly<{ passed: number; failed: number; failures: readonly TestFailure[] }>;

export type AgentRequest = Readonly<{
  step: AgentStep;
  history: readonly AgentTurn[];
  visits: string;
  tests?: TestReport;
}>;

export type AgentMove =
  | Readonly<{ kind: 'message' | 'run_tests' | 'done'; text: string }>
  | Readonly<{ kind: 'replace'; text: string; code: string }>;

export const agentLimits = {
  bodyBytes: 32 * 1024,
  visitsChars: 6000,
  historyEntries: 8,
  turnChars: 600,
  testFailures: 4,
  failureNameChars: 100,
  failureMessageChars: 200,
  moveTextChars: 1200,
  maxCalls: 4,
  maxOutputTokens: 3072,
} as const;

export const agentEndpoint = '/api/agent';
