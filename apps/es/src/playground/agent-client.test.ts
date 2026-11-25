import { describe, expect, it, vi } from 'vitest';

import { askAgent, requestBodyOf, testReportOf } from './agent-client.ts';
import { agentLimits, type AgentRequest, type AgentTurn } from './agent-protocol.ts';

const user = (text: string): AgentTurn => ({ role: 'user', text });
const assistant = (text: string): AgentTurn => ({ role: 'assistant', text });

const jsonResponse = (status: number, body: unknown = {}): Response => Response.json(body, { status });

describe('requestBodyOf', () => {
  it('履歴の件数を上限に収め、先頭を user にそろえる', () => {
    const history = Array.from(
      { length: 12 },
      (_, index) => index % 2 === 0 ? user(`u${index}`) : assistant(`a${index}`),
    );
    history.push(user('last'));
    const body = JSON.parse(requestBodyOf(1, history, 'code', undefined)) as AgentRequest;
    expect(body.history.length).toBeLessThanOrEqual(agentLimits.historyEntries);
    expect(body.history[0]?.role).toBe('user');
    expect(body.history.at(-1)?.text).toBe('last');
  });

  it('本文がバイト数の上限を超えるときは、古い履歴から外す', () => {
    const long = 'あ'.repeat(agentLimits.turnChars);
    const history = [
      user(long),
      assistant(long),
      user(long),
      assistant(long),
      user(long),
      assistant(long),
      user('last'),
    ];
    const visits = 'あ'.repeat(agentLimits.visitsChars);
    const body = requestBodyOf(1, history, visits, undefined);
    expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(agentLimits.bodyBytes);
    const parsed = JSON.parse(body) as AgentRequest;
    expect(parsed.history.at(-1)?.text).toBe('last');
    expect(parsed.history[0]?.role).toBe('user');
  });

  it('1件の文字数を上限に切り、tests は渡したときだけ含める', () => {
    const tests = { passed: 1, failed: 0, failures: [] };
    const withTests = JSON.parse(
      requestBodyOf(2, [user('x'.repeat(agentLimits.turnChars + 50))], 'code', tests),
    ) as AgentRequest;
    expect(withTests.history[0]?.text.length).toBe(agentLimits.turnChars);
    expect(withTests.tests).toEqual(tests);
    expect(requestBodyOf(2, [user('a')], 'code', undefined)).not.toContain('tests');
  });
});

describe('testReportOf', () => {
  it('pass と fail の件数と、失敗の名前と最初の1行を返す', () => {
    const report = testReportOf([
      { status: 'pass', path: ['既存の業務'], name: 'a' },
      { status: 'fail', path: ['第2章 ステップ1'], name: '記録が残る', message: '記録がありません\n詳細' },
      { status: 'skipped', path: [], name: 'c' },
    ]);
    expect(report).toEqual({
      passed: 1,
      failed: 1,
      failures: [{ name: '第2章 ステップ1 > 記録が残る', message: '記録がありません' }],
    });
  });

  it('失敗の件数が多くても、要約は上限の件数まで', () => {
    const tests = Array.from(
      { length: 9 },
      (_, index) => ({ status: 'fail', path: [], name: `t${index}`, message: 'm' }),
    );
    const report = testReportOf(tests);
    expect(report.failed).toBe(9);
    expect(report.failures).toHaveLength(agentLimits.testFailures);
  });
});

describe('askAgent', () => {
  it('Authorization に Bearer を付けて /api/agent へ POST し、手を返す', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(200, { move: { kind: 'message', text: 'はい' } }));
    const outcome = await askAgent('secret-value', '{}', fetcher);
    expect(outcome).toEqual({ type: 'move', move: { kind: 'message', text: 'はい' } });
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/agent');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer secret-value');
  });

  it.each(
    [
      [401, 'unauthorized'],
      [429, 'rate_limited'],
      [503, 'unavailable'],
      [502, 'unavailable'],
      [413, 'unavailable'],
    ] as const,
  )('状態 %i は %s', async (status, type) => {
    const outcome = await askAgent('p', '{}', vi.fn().mockResolvedValue(jsonResponse(status)));
    expect(outcome).toEqual({ type });
  });

  it('通信エラーと、読めない応答は unavailable', async () => {
    expect(await askAgent('p', '{}', vi.fn().mockRejectedValue(new TypeError('network')))).toEqual({
      type: 'unavailable',
    });
    expect(await askAgent('p', '{}', vi.fn().mockResolvedValue(jsonResponse(200, { move: { kind: 'x' } })))).toEqual({
      type: 'unavailable',
    });
    expect(
      await askAgent('p', '{}', vi.fn().mockResolvedValue(jsonResponse(200, { move: { kind: 'replace', text: '' } }))),
    )
      .toEqual({ type: 'unavailable' });
  });

  it('タイムアウトしたら、中断して unavailable', async () => {
    const fetcher = vi.fn((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })
    );
    const outcome = await askAgent('p', '{}', fetcher as unknown as typeof fetch, 20);
    expect(outcome).toEqual({ type: 'unavailable' });
  });
});
