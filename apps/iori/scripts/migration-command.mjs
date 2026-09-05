import { spawn } from 'node:child_process';
/** Wait for actual process close after abort; timeout is a failure ceiling, not a duration estimate. */
export const runMigrationCommand = (program, args, options) =>
  new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new Error('Migration command aborted.'));
      return;
    }
    const child = spawn(program, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output = { stdout: [], stderr: [] };
    let bytes = 0;
    let failed = false;
    let force;
    const cancel = () => {
      failed = true;
      child.kill('SIGTERM');
      force ??= setTimeout(() => child.kill('SIGKILL'), 5000);
    };
    const timer = setTimeout(cancel, options.timeout);
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
    child.once('close', code => {
      clearTimeout(timer);
      clearTimeout(force);
      options.signal?.removeEventListener('abort', cancel);
      if (failed || code !== 0) reject(new Error('Migration command failed; outcome may be uncertain.'));
      else {resolve({
          stdout: Buffer.concat(output.stdout).toString(),
          stderr: Buffer.concat(output.stderr).toString(),
        });}
    });
  });
