import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workflowFile = 'deploy-iori-worker-main.yml';
const activeStatuses = ['waiting', 'in_progress', 'queued'];
const startedJobStatuses = new Set(['in_progress', 'completed']);

export const cancelSupersededDeploys = async ({ repository, headSha, token, fetchImpl = fetch, log = console.log }) => {
  const request = (path, init = {}) =>
    fetchImpl(`https://api.github.com/repos/${repository}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
  const readJson = async path => {
    const response = await request(path);
    if (!response.ok) throw new Error(`GitHub API request failed: status=${response.status} path=${path}`);
    return response.json();
  };

  const runsById = new Map();
  for (const status of activeStatuses) {
    const { workflow_runs: runs } = await readJson(
      `/actions/workflows/${workflowFile}/runs?status=${status}&branch=main&event=push&per_page=100`,
    );
    for (const run of runs) runsById.set(run.id, run);
  }
  log(`Found ${runsById.size} active deploy runs`);

  const processRun = async run => {
    if (run.head_sha === headSha) return 0;
    const { status } = await readJson(`/compare/${run.head_sha}...${headSha}`);
    if (status !== 'ahead') {
      log(`Kept deploy run ${run.id}: head=${run.head_sha} comparison=${status}`);
      return 0;
    }
    const { jobs } = await readJson(`/actions/runs/${run.id}/jobs?per_page=100`);
    const deployJob = jobs.find(job => job.name === 'deploy-worker');
    if (deployJob !== undefined && startedJobStatuses.has(deployJob.status)) {
      log(`Kept deploy run ${run.id}: head=${run.head_sha} deploy-worker=${deployJob.status}`);
      return 0;
    }
    const response = await request(`/actions/runs/${run.id}/cancel`, { method: 'POST' });
    if (response.status === 202) {
      log(`Cancelled deploy run ${run.id}: head=${run.head_sha} superseded-by=${headSha}`);
      return 0;
    }
    log(`Failed to cancel deploy run ${run.id}: status=${response.status}`);
    return 1;
  };

  let failed = 0;
  for (const run of runsById.values()) {
    try {
      failed += await processRun(run);
    } catch (error) {
      failed += 1;
      log(`Failed to process deploy run ${run.id}: ${error.message}`);
    }
  }
  return failed === 0 ? 0 : 1;
};

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    process.exitCode = await cancelSupersededDeploys({
      repository: process.env.GITHUB_REPOSITORY,
      headSha: process.env.GITHUB_SHA,
      token: process.env.GITHUB_TOKEN,
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
