import { lstat, realpath } from 'node:fs/promises';
import { connect } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { logicalFilePath, SOURCE_LIMITS, sourceIdentitySchema } from './source-transfer-protocol.mjs';

export const sourceCommandArguments = (args) => {
  const [op, main_sha, run_id, argument, ...extra] = args;
  sourceIdentitySchema.parse({ main_sha, run_id });
  if (
    !['freeze', 'status', 'drain', 'resume', 'estimate', 'export', 'inventory', 'transfer'].includes(op) || extra.length
  ) throw new Error('Invalid source command.');
  const command = { op, main_sha, run_id };
  if (op === 'drain') {
    if (!/^\d+$/.test(argument ?? '') || Number(argument) < 1 || Number(argument) > 300_000) {
      throw new Error('Invalid source command.');
    }
    command.timeout_ms = Number(argument);
  } else if (op === 'resume') {
    if (!['destination_writes_not_enabled', 'destination_writes_reconciled'].includes(argument)) {
      throw new Error('Invalid source command.');
    }
    command.recovery = argument;
  } else if (op === 'transfer') {
    if (typeof argument !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/.test(argument)) {
      throw new Error('Invalid source command.');
    }
    logicalFilePath(argument);
    command.file_id = argument;
  } else if (argument !== undefined) throw new Error('Invalid source command.');
  return command;
};

// base/output injection is for fixture callers. The CLI fixes base to service-user home.
export const requestSourceControl = async ({ args, output, base = join(homedir(), '.iori-migration'), signal }) => {
  const command = sourceCommandArguments(args);
  const directory = await lstat(base);
  if (
    await realpath(base) !== base || !directory.isDirectory() || directory.uid !== process.getuid()
    || (directory.mode & 0o777) !== 0o700
  ) throw new Error('Unsafe source control.');
  const path = join(base, 'control.sock');
  const stat = await lstat(path);
  if (!stat.isSocket() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600) {
    throw new Error('Unsafe source control.');
  }
  const deadline = AbortSignal.any([AbortSignal.timeout(SOURCE_LIMITS.socketMs), ...(signal ? [signal] : [])]);
  const socket = connect(path);
  let bytes = 0;
  let prefix = Buffer.alloc(0);
  const bound = command.op === 'transfer' ? SOURCE_LIMITS.totalBytes + 2048 : SOURCE_LIMITS.inventoryBytes + 4096;
  const guard = new Transform({
    transform(chunk, _encoding, done) {
      bytes += chunk.length;
      if (bytes > bound) {
        done(new Error('Source output limit.'));
        return;
      }
      if (prefix.length < 64) prefix = Buffer.concat([prefix, chunk.subarray(0, 64 - prefix.length)]);
      done(null, chunk);
    },
  });
  socket.once('connect', () => socket.write(JSON.stringify(command) + '\n'));
  try {
    await pipeline(socket, guard, output, { end: false, signal: deadline });
    if (!prefix.toString('utf8').startsWith('{"ok":true,')) throw new Error('Source control rejected.');
  } finally {
    socket.destroy();
    guard.destroy();
  }
};
