import { spawn } from 'node:child_process';
import { lstat } from 'node:fs/promises';

import { assertExternalMigrationPath } from './migration-path-safety.mjs';
import { sourceCommandArguments } from './source-control-client.mjs';
import {
  SOURCE_LIMITS,
  SOURCE_REJECTION_DETAILS,
  sourceIdentitySchema,
  validateSourceState,
} from './source-transfer-protocol.mjs';

const privateInput = async (path) => {
  const resolved = await assertExternalMigrationPath(path);
  if (!/^[A-Za-z0-9_./-]+$/.test(resolved)) throw new Error('Invalid source inputs.');
  const stat = await lstat(resolved);
  if (
    !stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600 || stat.size < 1
    || stat.size > 65536
  ) throw new Error('Invalid source inputs.');
  return resolved;
};

export const assertSourceSshTarget = ({ host, user }) => {
  if (
    typeof host !== 'string' || host.length > 253 || !/^[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*$/.test(host)
    || typeof user !== 'string' || !/^[a-z_][a-z0-9_-]{0,31}$/.test(user)
  ) throw new Error('Invalid source inputs.');
};

// Production CLI callers use the native spawn. The second argument is solely a fixture transport seam.
export const createSourceSshAdapter = async (options, { spawnProcess = spawn } = {}) => {
  try {
    const { host, user, mainSha, runId } = options;
    assertSourceSshTarget({ host, user });
    sourceIdentitySchema.parse({ main_sha: mainSha, run_id: runId });
    const identityFile = await privateInput(options.identityFile);
    const knownHostsFile = await privateInput(options.knownHostsFile);
    const execute = async (op, argument, consume, signal) => {
      const commandArgs = [op, mainSha, runId, ...(argument === undefined ? [] : [String(argument)])];
      sourceCommandArguments(commandArgs);
      await privateInput(identityFile);
      await privateInput(knownHostsFile);
      signal?.throwIfAborted();
      const child = spawnProcess('ssh', [
        '-F',
        '/dev/null',
        '-T',
        '-a',
        '-o',
        'BatchMode=yes',
        '-o',
        'IdentitiesOnly=yes',
        '-o',
        'IdentityAgent=none',
        '-o',
        'StrictHostKeyChecking=yes',
        '-o',
        `UserKnownHostsFile=${knownHostsFile}`,
        '-o',
        'GlobalKnownHostsFile=/dev/null',
        '-o',
        'ClearAllForwardings=yes',
        '-o',
        'ConnectTimeout=15',
        '-o',
        'ServerAliveInterval=30',
        '-o',
        'ServerAliveCountMax=4',
        '-i',
        identityFile,
        '-l',
        user,
        '--',
        host,
        '"$HOME/.nvm/versions/node/v24.12.0/bin/node"',
        '"$HOME/monorepo/apps/iori/scripts/source-control.mjs"',
        ...commandArgs,
      ], { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
      let closed = false;
      let force;
      let spawnFailed = false;
      let timedOut = false;
      let closeSignal;
      const exited = new Promise((resolve) => {
        child.once('error', () => {
          closed = true;
          spawnFailed = true;
          resolve(undefined);
        });
        child.once('close', (code, exitSignal) => {
          closed = true;
          closeSignal = exitSignal;
          resolve(code);
        });
      });
      child.stderr.resume();
      child.stdout.on('error', () => {});
      const cancel = () => {
        child.stdout.destroy(new Error('Source operation aborted.'));
        if (!closed) {
          child.kill('SIGTERM');
          force ??= setTimeout(() => {
            if (!closed) child.kill('SIGKILL');
          }, 3000);
        }
      };
      const timer = setTimeout(() => {
        timedOut = true;
        cancel();
      }, SOURCE_LIMITS.estimateMs + 10_000);
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        const result = await consume(child.stdout);
        if (await exited !== 0) throw new Error();
        return result;
      } catch (cause) {
        if (!child.stdout.readableEnded) cancel();
        const code = await exited;
        const reason = spawnFailed
          ? 'spawn-failed'
          : signal?.aborted || timedOut
          ? 'aborted'
          : code === 75
          ? 'not-ready'
          : code === 76
          ? 'busy'
          : cause?.sourceReason ?? (code === 0 ? 'invalid-response' : 'ssh-failed');
        const diagnostic = {
          reason,
          exit: Number.isInteger(code) ? code : undefined,
          signal: typeof closeSignal === 'string' ? closeSignal : undefined,
        };
        if (op === 'status' && code === 75) {
          throw Object.assign(new Error('Source control is not ready.'), { retryable: true, diagnostic });
        }
        if (code === 76) throw Object.assign(new Error('Source is not idle.'), { diagnostic });
        throw Object.assign(new Error('Source operation failed.'), { diagnostic });
      } finally {
        clearTimeout(timer);
        clearTimeout(force);
        signal?.removeEventListener('abort', cancel);
      }
    };
    const metadata = async (op, argument, signal) =>
      execute(op, argument, async (stream) => {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of stream) {
          bytes += chunk.length;
          if (bytes > SOURCE_LIMITS.inventoryBytes + 4096) throw new Error();
          chunks.push(chunk);
        }
        const response = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (response?.ok === false) {
          throw Object.assign(new Error(), {
            sourceReason: response.error === 'control_rejected' && SOURCE_REJECTION_DETAILS.includes(response.detail)
              ? response.detail
              : 'rejected',
          });
        }
        if (response?.ok !== true) throw new Error();
        const state = validateSourceState(response.state);
        if (
          state.source_revision !== mainSha
          || (state.identity && (state.identity.main_sha !== mainSha || state.identity.run_id !== runId))
        ) throw new Error();
        return state;
      }, signal);
    return {
      status: (signal) => metadata('status', undefined, signal),
      resume: (recovery, signal) => metadata('resume', recovery, signal),
    };
  } catch {
    throw new Error('Invalid source inputs.');
  }
};
