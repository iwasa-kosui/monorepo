import { spawn } from 'node:child_process';

import { createPrivateCommandLog } from './private-command-log.mjs';
/** Wait for actual process close after abort; timeout is a failure ceiling, not a duration estimate. */
const runOwnedCommand = (program, args, options) =>
  new Promise((resolve, reject) => {
    if (
      options.killGraceMs !== undefined
      && (!Number.isSafeInteger(options.killGraceMs) || options.killGraceMs <= 0 || options.killGraceMs > 15000)
    ) {
      reject(new Error('Invalid command cleanup grace.'));
      return;
    }
    if (process.platform === 'win32') {
      reject(new Error('Migration commands require POSIX process groups.'));
      return;
    }
    if (options.signal?.aborted) {
      reject(new Error('Migration command aborted.'));
      return;
    }
    const child = spawn(program, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      // Own a dedicated group so pnpm's descendants share the abort boundary.
      detached: true,
      stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    const output = { stdout: [], stderr: [] };
    let bytes = 0;
    let failed = false;
    let settled = false;
    let force;
    const terminateGroup = (signal) => {
      if (!Number.isSafeInteger(child.pid) || child.pid <= 0) return;
      try {
        process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== 'ESRCH') failed = true;
      }
    };
    const cancel = () => {
      if (settled) return;
      failed = true;
      terminateGroup('SIGTERM');
      force ??= setTimeout(() => terminateGroup('SIGKILL'), options.killGraceMs ?? 5000);
    };
    const timer = setTimeout(cancel, options.timeout);
    if (options.input !== undefined) {
      child.stdin.on('error', cancel);
      child.stdin.end(options.input);
    }
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) cancel();
    for (const name of ['stdout', 'stderr']) {
      child[name].on('data', chunk => {
        bytes += chunk.length;
        if (bytes > options.maxBuffer) {
          cancel();
          return;
        }
        output[name].push(chunk);
      });
    }
    child.once('error', () => {
      failed = true;
    });
    child.once('close', async code => {
      settled = true;
      clearTimeout(timer);
      clearTimeout(force);
      options.signal?.removeEventListener('abort', cancel);
      const result = {
        stdout: Buffer.concat(output.stdout).toString(),
        stderr: Buffer.concat(output.stderr).toString(),
      };
      try {
        await options.captureOutput?.(result);
      } catch {
        failed = true;
      }
      if (failed || code !== 0 || options.signal?.aborted) {
        reject(new Error('Migration command failed; outcome may be uncertain.'));
      } else resolve(result);
    });
  });

export const runMigrationCommand = async (program, args, options) => {
  const directory = (options.env ?? process.env).IORI_PRIVATE_LOG_DIRECTORY;
  const log = !options.captureOutput && directory ? await createPrivateCommandLog(directory) : undefined;
  try {
    return await runOwnedCommand(program, args, { ...options, captureOutput: options.captureOutput ?? log?.capture });
  } finally {
    await log?.close();
  }
};
