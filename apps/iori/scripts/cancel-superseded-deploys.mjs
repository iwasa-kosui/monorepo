import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workflowFile = 'deploy-iori-worker-main.yml';

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

  const { workflow_runs: runs } = await readJson(
    `/actions/workflows/${workflowFile}/runs?status=waiting&branch=main&event=push&per_page=100`,
  );
  let failed = 0;
  for (const run of runs) {
    if (run.head_sha === headSha) continue;
    const { status } = await readJson(`/compare/${run.head_sha}...${headSha}`);
    if (status !== 'ahead') {
      log(`Kept deploy run ${run.id}: head=${run.head_sha} comparison=${status}`);
      continue;
    }
    const response = await request(`/actions/runs/${run.id}/cancel`, { method: 'POST' });
    if (response.status === 202) {
      log(`Cancelled deploy run ${run.id}: head=${run.head_sha} superseded-by=${headSha}`);
    } else {
      failed += 1;
      log(`Failed to cancel deploy run ${run.id}: status=${response.status}`);
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
