import {
  agentEndpoint,
  agentLimits,
  type AgentMove,
  type AgentRequest,
  type AgentStep,
  type AgentTurn,
  type TestReport,
} from './agent-protocol.ts';

export type AgentOutcome =
  | Readonly<{ type: 'move'; move: AgentMove }>
  | Readonly<{ type: 'unauthorized' | 'rate_limited' | 'unavailable' }>;

export const requestTimeoutMs = 30_000;

export const clipText = (text: string, limit: number): string => text.trim().slice(0, limit);

export const testReportOf = (
  tests: readonly Readonly<{ status: string; path: readonly string[]; name: string; message?: string | null }>[],
): TestReport => {
  const failures = tests.filter((test) => test.status === 'fail');
  return {
    passed: tests.filter((test) => test.status === 'pass').length,
    failed: failures.length,
    failures: failures.slice(0, agentLimits.testFailures).map((test) => ({
      name: clipText([...test.path, test.name].join(' > '), agentLimits.failureNameChars),
      message: clipText((test.message ?? '').split('\n')[0] ?? '', agentLimits.failureMessageChars),
    })),
  };
};

const byteLength = (text: string): number => new TextEncoder().encode(text).length;

export const requestBodyOf = (
  step: AgentStep,
  history: readonly AgentTurn[],
  visits: string,
  tests: TestReport | undefined,
): string => {
  let turns = history.slice(-agentLimits.historyEntries).map((turn): AgentTurn => ({
    role: turn.role,
    text: clipText(turn.text, agentLimits.turnChars),
  }));
  const build = (): string => {
    const request: AgentRequest = tests === undefined
      ? { step, history: turns, visits }
      : { step, history: turns, visits, tests };
    return JSON.stringify(request);
  };
  for (;;) {
    while (turns.length > 1 && turns[0]?.role !== 'user') {
      turns = turns.slice(1);
    }
    const body = build();
    if (byteLength(body) <= agentLimits.bodyBytes || turns.length <= 1) {
      return body;
    }
    turns = turns.slice(1);
  }
};

const isMove = (value: unknown): value is AgentMove => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const move = value as Record<string, unknown>;
  if (typeof move['text'] !== 'string') {
    return false;
  }
  if (move['kind'] === 'replace') {
    return typeof move['code'] === 'string' && move['code'] !== '';
  }
  return move['kind'] === 'message' || move['kind'] === 'run_tests' || move['kind'] === 'done';
};

export const askAgent = async (
  password: string,
  body: string,
  fetcher: typeof fetch = fetch,
  timeoutMs: number = requestTimeoutMs,
): Promise<AgentOutcome> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(agentEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${password}` },
      body,
      signal: controller.signal,
    });
    if (response.status === 401) {
      return { type: 'unauthorized' };
    }
    if (response.status === 429) {
      return { type: 'rate_limited' };
    }
    if (!response.ok) {
      return { type: 'unavailable' };
    }
    const json: unknown = await response.json();
    const move = typeof json === 'object' && json !== null ? (json as Record<string, unknown>)['move'] : undefined;
    return isMove(move) ? { type: 'move', move } : { type: 'unavailable' };
  } catch {
    return { type: 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
};
