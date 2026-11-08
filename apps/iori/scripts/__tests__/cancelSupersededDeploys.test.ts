import { describe, expect, it } from 'vitest';

import { cancelSupersededDeploys } from '../cancel-superseded-deploys.mjs';

const listUrl =
  'https://api.github.com/repos/owner/repo/actions/workflows/deploy-iori-worker-main.yml/runs?status=waiting&branch=main&event=push&per_page=100';
const headSha = 'f'.repeat(40);
const oldSha = 'a'.repeat(40);
const olderSha = 'b'.repeat(40);

type Call = { url: string; method: string };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const setup = (
  respond: (url: string, method: string) => Response,
) => {
  const calls: Call[] = [];
  const logs: string[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method });
    return respond(url, method);
  }) as typeof fetch;
  const run = () =>
    cancelSupersededDeploys({
      repository: 'owner/repo',
      headSha,
      token: 'token',
      fetchImpl,
      log: message => logs.push(message),
    });
  return { calls, logs, run };
};

const cancels = (calls: Call[]) => calls.filter(call => call.method === 'POST').map(call => call.url);

describe('cancelSupersededDeploys', () => {
  it('reads the waiting runs of the main push deploy workflow', async () => {
    const { calls, run } = setup(() => json({ workflow_runs: [] }));
    await run();
    expect(calls[0]).toEqual({ url: listUrl, method: 'GET' });
  });

  it('cancels a waiting run whose head is behind the current commit and returns 0', async () => {
    const { calls, run } = setup((url, method) => {
      if (url === listUrl) return json({ workflow_runs: [{ id: 11, head_sha: oldSha }] });
      if (url.endsWith(`/compare/${oldSha}...${headSha}`)) return json({ status: 'ahead' });
      if (method === 'POST') return json({}, 202);
      return json({}, 404);
    });
    expect(await run()).toBe(0);
    expect(cancels(calls)).toEqual(['https://api.github.com/repos/owner/repo/actions/runs/11/cancel']);
  });

  it('neither compares nor cancels a run whose head is the current commit', async () => {
    const { calls, run } = setup(url => {
      if (url === listUrl) return json({ workflow_runs: [{ id: 12, head_sha: headSha }] });
      return json({}, 404);
    });
    expect(await run()).toBe(0);
    expect(calls).toEqual([{ url: listUrl, method: 'GET' }]);
  });

  it.each(['behind', 'diverged', 'identical'])('does not cancel a run whose comparison is %s', async comparison => {
    const { calls, run } = setup(url => {
      if (url === listUrl) return json({ workflow_runs: [{ id: 13, head_sha: oldSha }] });
      if (url.includes('/compare/')) return json({ status: comparison });
      return json({}, 404);
    });
    expect(await run()).toBe(0);
    expect(cancels(calls)).toEqual([]);
  });

  it('processes the remaining runs and returns 1 when a cancel is not accepted', async () => {
    const { calls, logs, run } = setup((url, method) => {
      if (url === listUrl) {
        return json({
          workflow_runs: [{ id: 21, head_sha: oldSha }, { id: 22, head_sha: olderSha }],
        });
      }
      if (url.includes('/compare/')) return json({ status: 'ahead' });
      if (method === 'POST' && url.endsWith('/runs/21/cancel')) return json({}, 409);
      if (method === 'POST') return json({}, 202);
      return json({}, 404);
    });
    expect(await run()).toBe(1);
    expect(cancels(calls)).toEqual([
      'https://api.github.com/repos/owner/repo/actions/runs/21/cancel',
      'https://api.github.com/repos/owner/repo/actions/runs/22/cancel',
    ]);
    expect(logs.some(message => message.includes('21') && message.includes('409'))).toBe(true);
  });

  it('returns 0 without cancelling when no run is waiting', async () => {
    const { calls, run } = setup(() => json({ workflow_runs: [] }));
    expect(await run()).toBe(0);
    expect(cancels(calls)).toEqual([]);
  });

  it('throws an error with the status when the list cannot be read', async () => {
    const { run } = setup(() => json({}, 500));
    await expect(run()).rejects.toThrow('status=500');
  });
});
