#!/usr/bin/env node
import { lstat, realpath } from 'node:fs/promises';
import { connect } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Usage: node scripts/source-control.mjs freeze|status|drain|resume MAIN_SHA RUN_ID [TIMEOUT_MS|RECOVERY]
// Execute on the source host as the service user.
const [op, main_sha, run_id, argument, ...extra] = process.argv.slice(2);
if (
  !['freeze', 'status', 'drain', 'resume'].includes(op) || !/^[a-f0-9]{40}$/.test(main_sha ?? '')
  || !/^[A-Za-z0-9_-]{1,80}$/.test(run_id ?? '') || extra.length
  || (['freeze', 'status'].includes(op) && argument !== undefined)
  || (op === 'drain' && (!/^\d+$/.test(argument ?? '') || Number(argument) < 1 || Number(argument) > 300_000))
  || (op === 'resume' && !['destination_writes_not_enabled', 'destination_writes_reconciled'].includes(argument))
) {
  console.error('Invalid source control arguments');
  process.exitCode = 1;
} else {
  try {
    const base = join(homedir(), '.iori-migration');
    const directory = await lstat(base);
    if (
      await realpath(base) !== base || !directory.isDirectory() || directory.uid !== process.getuid()
      || (directory.mode & 0o777) !== 0o700
    ) throw new Error();
    const path = join(base, 'control.sock');
    const stat = await lstat(path);
    if (!stat.isSocket() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600) throw new Error();
    const command = {
      op,
      main_sha,
      run_id,
      ...(op === 'drain' ? { timeout_ms: Number(argument) } : {}),
      ...(op === 'resume' ? { recovery: argument } : {}),
    };
    const result = await new Promise((resolve, reject) => {
      const socket = connect(path);
      let output = '';
      socket.setTimeout(310_000, () => {
        socket.destroy();
        reject(new Error());
      });
      socket.on('error', reject);
      socket.on('connect', () => socket.write(JSON.stringify(command) + '\n'));
      socket.on('data', (chunk) => {
        output += chunk.toString('utf8');
        if (Buffer.byteLength(output) > 2048) {
          socket.destroy();
          reject(new Error());
        }
      });
      socket.on('end', () => {
        try {
          resolve(JSON.parse(output));
        } catch {
          reject(new Error());
        }
      });
    });
    console.log(JSON.stringify(result));
    if (result.ok !== true) process.exitCode = 1;
  } catch {
    console.error('Source control unavailable or rejected');
    process.exitCode = 1;
  }
}
