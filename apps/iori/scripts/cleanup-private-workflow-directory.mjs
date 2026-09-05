import { lstat, realpath, rm } from 'node:fs/promises';
import { relative } from 'node:path';

const isWithin = (candidate, parent) => {
  const path = relative(parent, candidate);
  return path !== '' && !path.startsWith('..');
};

export const removePrivateWorkflowDirectory = async ({ directory, runnerTemp }) => {
  if (
    typeof directory !== 'string' || typeof runnerTemp !== 'string' || directory.length === 0 || runnerTemp.length === 0
  ) {
    throw new Error('Private workflow directory is invalid.');
  }
  try {
    const [realDirectory, realRunnerTemp, metadata] = await Promise.all([
      realpath(directory),
      realpath(runnerTemp),
      lstat(directory),
    ]);
    if (
      metadata.isSymbolicLink()
      || !metadata.isDirectory()
      || (metadata.mode & 0o077) !== 0
      || !isWithin(realDirectory, realRunnerTemp)
      || !realDirectory.split('/').at(-1)?.startsWith('iori-private-')
    ) throw new Error('invalid');
    await rm(realDirectory, { recursive: true, force: false, maxRetries: 2 });
  } catch {
    throw new Error('Private workflow directory is invalid.');
  }
};

if (process.argv[1]?.endsWith('cleanup-private-workflow-directory.mjs')) {
  removePrivateWorkflowDirectory({ directory: process.env.IORI_PRIVATE_DIRECTORY, runnerTemp: process.env.RUNNER_TEMP })
    .catch(() => {
      console.error('Private workflow directory cleanup failed.');
      process.exitCode = 1;
    });
}
