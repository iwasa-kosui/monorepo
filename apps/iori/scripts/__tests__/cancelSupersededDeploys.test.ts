import { describe, expect, it } from 'vitest';

import { cancelSupersededDeploys } from '../cancel-superseded-deploys.mjs';

const activeStatuses = ['waiting', 'in_progress', 'queued'] as const;
type ActiveStatus = typeof activeStatuses[number];
const listUrl = (status: ActiveStatus) =>
  `https://api.github.com/repos/owner/repo/actions/workflows/deploy-iori-worker-main.yml/runs?status=${status}&branch=main&event=push&per_page=100`;
const jobsUrl = (id: number) => `https://api.github.com/repos/owner/repo/actions/runs/${id}/jobs?per_page=100`;
const headSha = 'f'.repeat(40);
const oldSha = 'a'.repeat(40);
const olderSha = 'b'.repeat(40);

type Call = { url: string; method: string };
type Run = { id: number; head_sha: string };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const listResponse = (url: string, byStatus: Partial<Record<ActiveStatus, Run[]>>) => {
  const status = activeStatuses.find(candidate => url === listUrl(candidate));
  return status === undefined ? undefined : json({ workflow_runs: byStatus[status] ?? [] });
};

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
  it('reads the waiting, in_progress and queued runs of the main push deploy workflow', async () => {
    const { calls, run } = setup(url => listResponse(url, {}) ?? json({}, 404));
    await run();
    expect(calls).toEqual(activeStatuses.map(status => ({ url: listUrl(status), method: 'GET' })));
  });

  it('cancels a waiting run whose head is behind the current commit and returns 0', async () => {
    const { calls, run } = setup((url, method) => {
      const list = listResponse(url, { waiting: [{ id: 11, head_sha: oldSha }] });
      if (list !== undefined) return list;
      if (url.endsWith(`/compare/${oldSha}...${headSha}`)) return json({ status: 'ahead' });
      if (url === jobsUrl(11)) return json({ jobs: [] });
      if (method === 'POST') return json({}, 202);
      return json({}, 404);
    });
    expect(await run()).toBe(0);
    expect(cancels(calls)).toEqual(['https://api.github.com/repos/owner/repo/actions/runs/11/cancel']);
  });

  it('cancels an in_progress run that has no deploy-worker job yet', async () => {
    const { calls, run } = setup((url, method) => {
      const list = listResponse(url, { in_progress: [{ id: 14, head_sha: oldSha }] });
      if (list !== undefined) return list;
      if (url.endsWith(`/compare/${oldSha}...${headSha}`)) return json({ status: 'ahead' });
      if (url === jobsUrl(14)) return json({ jobs: [{ name: 'public-artifact-gate', status: 'in_progress' }] });
      if (method === 'POST') return json({}, 202);
      return json({}, 404);
    });
    expect(await run()).toBe(0);
    expect(cancels(calls)).toEqual(['https://api.github.com/repos/owner/repo/actions/runs/14/cancel']);
  });

  it.each(['waiting', 'queued'])('cancels a run whose deploy-worker job is %s', async jobStatus => {
    const { calls, run } = setup((url, method) => {
      const list = listResponse(url, { in_progress: [{ id: 15, head_sha: oldSha }] });
      if (list !== undefined) return list;
      if (url.endsWith(`/compare/${oldSha}...${headSha}`)) return json({ status: 'ahead' });
      if (url === jobsUrl(15)) {
        return json({
          jobs: [{ name: 'public-artifact-gate', status: 'completed' }, { name: 'deploy-worker', status: jobStatus }],
        });
      }
      if (method === 'POST') return json({}, 202);
      return json({}, 404);
    });
    expect(await run()).toBe(0);
    expect(cancels(calls)).toEqual(['https://api.github.com/repos/owner/repo/actions/runs/15/cancel']);
  });

  it.each(['in_progress', 'completed'])('does not cancel a run whose deploy-worker job is %s', async jobStatus => {
    const { calls, logs, run } = setup((url, method) => {
      const list = listResponse(url, { in_progress: [{ id: 16, head_sha: oldSha }] });
      if (list !== undefined) return list;
      if (url.endsWith(`/compare/${oldSha}...${headSha}`)) return json({ status: 'ahead' });
      if (url === jobsUrl(16)) return json({ jobs: [{ name: 'deploy-worker', status: jobStatus }] });
      if (method === 'POST') return json({}, 202);
      return json({}, 404);
    });
    expect(await run()).toBe(0);
    expect(cancels(calls)).toEqual([]);
    expect(logs.some(message => message.includes(`deploy-worker=${jobStatus}`))).toBe(true);
  });

  it('neither compares nor cancels a run whose head is the current commit', async () => {
    const { calls, run } = setup(url =>
      listResponse(url, { waiting: [{ id: 12, head_sha: headSha }] }) ?? json({}, 404)
    );
    expect(await run()).toBe(0);
    expect(calls).toEqual(activeStatuses.map(status => ({ url: listUrl(status), method: 'GET' })));
  });

  it.each(['behind', 'diverged', 'identical'])('does not cancel a run whose comparison is %s', async comparison => {
    const { calls, run } = setup(url => {
      const list = listResponse(url, { waiting: [{ id: 13, head_sha: oldSha }] });
      if (list !== undefined) return list;
      if (url.includes('/compare/')) return json({ status: comparison });
      return json({}, 404);
    });
    expect(await run()).toBe(0);
    expect(cancels(calls)).toEqual([]);
  });

  it('processes the remaining runs and returns 1 when a cancel is not accepted', async () => {
    const { calls, logs, run } = setup((url, method) => {
      const list = listResponse(url, {
        waiting: [{ id: 21, head_sha: oldSha }, { id: 22, head_sha: olderSha }],
      });
      if (list !== undefined) return list;
      if (url.includes('/compare/')) return json({ status: 'ahead' });
      if (url === jobsUrl(21) || url === jobsUrl(22)) return json({ jobs: [] });
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

  it('processes the remaining runs and returns 1 when the comparison of a run fails', async () => {
    const { calls, logs, run } = setup((url, method) => {
      const list = listResponse(url, {
        waiting: [{ id: 31, head_sha: oldSha }, { id: 32, head_sha: olderSha }],
      });
      if (list !== undefined) return list;
      if (url.includes(`/compare/${oldSha}...`)) return json({}, 500);
      if (url.includes(`/compare/${olderSha}...`)) return json({ status: 'ahead' });
      if (url === jobsUrl(32)) return json({ jobs: [] });
      if (method === 'POST') return json({}, 202);
      return json({}, 404);
    });
    expect(await run()).toBe(1);
    expect(cancels(calls)).toEqual(['https://api.github.com/repos/owner/repo/actions/runs/32/cancel']);
    expect(logs.some(message => message.includes('31'))).toBe(true);
  });

  it('cancels a run listed under two statuses only once', async () => {
    const { calls, run } = setup((url, method) => {
      const list = listResponse(url, {
        waiting: [{ id: 41, head_sha: oldSha }],
        in_progress: [{ id: 41, head_sha: oldSha }],
      });
      if (list !== undefined) return list;
      if (url.includes('/compare/')) return json({ status: 'ahead' });
      if (url === jobsUrl(41)) return json({ jobs: [] });
      if (method === 'POST') return json({}, 202);
      return json({}, 404);
    });
    expect(await run()).toBe(0);
    expect(cancels(calls)).toEqual(['https://api.github.com/repos/owner/repo/actions/runs/41/cancel']);
  });

  it('logs the number of active runs', async () => {
    const { logs, run } = setup(url => listResponse(url, {}) ?? json({}, 404));
    await run();
    expect(logs).toContain('Found 0 active deploy runs');
  });

  it('returns 0 without cancelling when no run is active', async () => {
    const { calls, run } = setup(url => listResponse(url, {}) ?? json({}, 404));
    expect(await run()).toBe(0);
    expect(cancels(calls)).toEqual([]);
  });

  it('throws an error with the status when the list cannot be read', async () => {
    const { run } = setup(() => json({}, 500));
    await expect(run()).rejects.toThrow('status=500');
  });
});
