import {
  agentLimits,
  type AgentRequest,
  type AgentStep,
  type AgentTurn,
  type TestFailure,
  type TestReport,
} from '../../src/playground/agent-protocol.ts';

export type ParsedRequest = Readonly<{ ok: true; value: AgentRequest }> | Readonly<{ ok: false; reason: string }>;

const invalid = (reason: string): ParsedRequest => ({ ok: false, reason });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

const parseTurns = (value: unknown): readonly AgentTurn[] | string => {
  if (!Array.isArray(value) || value.length === 0 || value.length > agentLimits.historyEntries) {
    return 'history の件数が範囲外です';
  }
  const turns: AgentTurn[] = [];
  for (const entry of value as unknown[]) {
    if (
      !isRecord(entry) || (entry['role'] !== 'user' && entry['role'] !== 'assistant')
      || typeof entry['text'] !== 'string' || entry['text'].length === 0 || entry['text'].length > agentLimits.turnChars
    ) {
      return 'history の要素が不正です';
    }
    turns.push({ role: entry['role'], text: entry['text'] });
  }
  if (turns[0]?.role !== 'user' || turns.at(-1)?.role !== 'user') {
    return 'history は user から始まり、user で終わる必要があります';
  }
  return turns;
};

const parseTests = (value: unknown): TestReport | string => {
  if (
    !isRecord(value) || !isCount(value['passed']) || !isCount(value['failed']) || !Array.isArray(value['failures'])
    || value['failures'].length > agentLimits.testFailures
  ) {
    return 'tests が不正です';
  }
  const failures: TestFailure[] = [];
  for (const entry of value['failures'] as unknown[]) {
    if (
      !isRecord(entry) || typeof entry['name'] !== 'string' || typeof entry['message'] !== 'string'
      || entry['name'].length > agentLimits.failureNameChars
      || entry['message'].length > agentLimits.failureMessageChars
    ) {
      return 'tests の失敗の要約が不正です';
    }
    failures.push({ name: entry['name'], message: entry['message'] });
  }
  return { passed: value['passed'], failed: value['failed'], failures };
};

export const parseAgentRequest = (text: string): ParsedRequest => {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return invalid('JSON として読めません');
  }
  if (!isRecord(body)) {
    return invalid('JSON のオブジェクトが必要です');
  }
  const step = body['step'];
  if (step !== 1 && step !== 2) {
    return invalid('step は 1 か 2 です');
  }
  const visits = body['visits'];
  if (typeof visits !== 'string' || visits.length === 0 || visits.length > agentLimits.visitsChars) {
    return invalid('visits の文字数が範囲外です');
  }
  const history = parseTurns(body['history']);
  if (typeof history === 'string') {
    return invalid(history);
  }
  if (body['tests'] === undefined) {
    return { ok: true, value: { step: step as AgentStep, history, visits } };
  }
  const tests = parseTests(body['tests']);
  if (typeof tests === 'string') {
    return invalid(tests);
  }
  return { ok: true, value: { step: step as AgentStep, history, visits, tests } };
};

export const readLimitedText = async (request: Request, limit: number): Promise<string | null> => {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > limit) {
    return null;
  }
  if (request.body === null) {
    return '';
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
};
