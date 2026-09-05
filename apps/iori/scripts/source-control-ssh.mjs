import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, open, statfs } from 'node:fs/promises';
import { join } from 'node:path';

import { assertExternalMigrationPath, assertExternalMigrationRoot } from './migration-path-safety.mjs';
import { sourceCommandArguments } from './source-control-client.mjs';
import {
  SOURCE_LIMITS,
  sourceIdentitySchema,
  validateSourceEstimate,
  validateSourceInventory,
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

// Production CLI callers use the native spawn. The second argument is solely a fixture transport seam.
export const createSourceSshAdapter = async (options, { spawnProcess = spawn } = {}) => {
  try {
    const { host, user, mainSha, runId } = options;
    if (
      typeof host !== 'string' || host.length > 253 || !/^[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*$/.test(host)
      || typeof user !== 'string' || !/^[a-z_][a-z0-9_-]{0,31}$/.test(user)
    ) throw new Error();
    const identity = sourceIdentitySchema.parse({ main_sha: mainSha, run_id: runId });
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
      const exited = new Promise((resolve) => {
        child.once('error', () => {
          closed = true;
          resolve(false);
        });
        child.once('close', (code) => {
          closed = true;
          resolve(code === 0);
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
      const milliseconds = op === 'export'
        ? SOURCE_LIMITS.socketMs
        : op === 'transfer'
        ? SOURCE_LIMITS.transferMs
        : op === 'drain'
        ? 310_000
        : SOURCE_LIMITS.estimateMs + 10_000;
      const timer = setTimeout(cancel, milliseconds);
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        const result = await consume(child.stdout);
        if (!await exited) throw new Error();
        return result;
      } catch {
        cancel();
        await exited;
        throw new Error('Source operation failed.');
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
        if (response?.ok !== true) throw new Error();
        const state = validateSourceState(response.state);
        if (
          state.source_revision !== mainSha
          || (state.identity && (state.identity.main_sha !== mainSha || state.identity.run_id !== runId))
        ) throw new Error();
        if (op === 'freeze' && (!state.ingress_frozen || !state.identity)) throw new Error();
        if (op === 'drain' && !state.drained) throw new Error();
        return state;
      }, signal);
    return {
      estimate: async (signal) => {
        try {
          const state = await metadata('estimate', undefined, signal);
          return { ...validateSourceEstimate(state.estimate), source_revision: state.source_revision };
        } catch {
          throw new Error('Source operation failed.');
        }
      },
      freeze: (signal) => metadata('freeze', undefined, signal),
      status: (signal) => metadata('status', undefined, signal),
      drain: (timeoutMs = 300_000, signal) => metadata('drain', timeoutMs, signal),
      export: async (signal) => {
        try {
          const state = await metadata('export', undefined, signal);
          const inventory = validateSourceInventory(state.inventory);
          if (!state.drained || inventory.identity.main_sha !== mainSha || inventory.identity.run_id !== runId) {
            throw new Error();
          }
          return inventory;
        } catch {
          throw new Error('Source operation failed.');
        }
      },
      restore: async (outputDir, signal) => {
        try {
          const root = await assertExternalMigrationPath(outputDir);
          await mkdir(root, { mode: 0o700 });
          await assertExternalMigrationRoot(root);
          const state = await metadata('inventory', undefined, signal);
          const inventory = validateSourceInventory(state.inventory);
          if (!state.drained) throw new Error();
          if (inventory.identity.main_sha !== identity.main_sha || inventory.identity.run_id !== identity.run_id) {
            throw new Error();
          }
          const fs = await statfs(root);
          if (fs.bavail * fs.bsize < inventory.totalBytes + SOURCE_LIMITS.inventoryBytes) throw new Error();
          await mkdir(join(root, 'export'), { mode: 0o700 });
          await mkdir(join(root, 'uploads'), { mode: 0o700 });
          for (const file of inventory.files) {
            signal?.throwIfAborted();
            const output = await open(join(root, file.path), 'wx', 0o600);
            try {
              await execute('transfer', file.id, async (stream) => {
                let header = Buffer.alloc(0);
                let started = false;
                let bytes = 0;
                const hash = createHash('sha256');
                for await (let chunk of stream) {
                  if (!started) {
                    const newline = chunk.indexOf(10);
                    if (newline < 0) {
                      if (header.length + chunk.length > 2048) throw new Error();
                      header = Buffer.concat([header, chunk]);
                      continue;
                    }
                    if (header.length + newline > 2048) throw new Error();
                    header = Buffer.concat([header, chunk.subarray(0, newline)]);
                    const response = JSON.parse(header.toString('utf8'));
                    if (
                      response.ok !== true || response.file?.id !== file.id || response.file?.bytes !== file.bytes
                      || response.file?.checksum !== file.checksum || response.file?.path !== file.path
                    ) throw new Error();
                    started = true;
                    chunk = chunk.subarray(newline + 1);
                  }
                  bytes += chunk.length;
                  if (bytes > file.bytes) throw new Error();
                  hash.update(chunk);
                  await output.writeFile(chunk);
                }
                if (!started || bytes !== file.bytes || hash.digest('hex') !== file.checksum) throw new Error();
              }, signal);
              await output.sync();
            } finally {
              await output.close();
            }
          }
          signal?.throwIfAborted();
          const inventoryPath = join(root, 'source-inventory.json');
          const receipt = await open(inventoryPath, 'wx', 0o600);
          try {
            await receipt.writeFile(JSON.stringify(inventory));
            await receipt.sync();
          } finally {
            await receipt.close();
          }
          return {
            root,
            manifestPath: join(root, 'export/export-manifest.json'),
            uploadDir: join(root, 'uploads'),
            inventoryPath,
          };
        } catch {
          throw new Error('Source restore failed.');
        }
      },
    };
  } catch {
    throw new Error('Invalid source inputs.');
  }
};
