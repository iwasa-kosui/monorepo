import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, openSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const guardPath = resolve(dirname(fileURLToPath(import.meta.url)), 'assert-workflow-output.mjs');
const controlCharacters = /[\p{Cc}\u2028\u2029]/gu;
const urlCredentials = /([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^\s/]+@/g;

const authenticationFailure =
  /\b(401|403)\b|unauthori[sz]ed|forbidden|authentication (failed|required)|invalid credentials/i;
const networkFailure =
  /\b(429|502|503|504)\b|too many requests|bad gateway|service unavailable|gateway time-?out|timed? ?out|deadline exceeded|connection (refused|reset|closed)|no such host|temporary failure|could not connect|tls handshake|\bEOF\b|try again later/i;

export const classifyFailure = output => {
  if (authenticationFailure.test(output)) return 'authentication';
  if (networkFailure.test(output)) return 'network';
  return 'other';
};

const runGuard = (text, stderr) => {
  const result = spawnSync(process.execPath, [guardPath], { input: text, stdio: ['pipe', 'ignore', 'pipe'] });
  if (result.stderr.length > 0) stderr(result.stderr.toString('utf8'));
  return result.status ?? 1;
};

const tailOf = (text, tailLines) => {
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines.slice(-tailLines).map((line) =>
    line.replaceAll('\t', ' ').replace(controlCharacters, '').replace(urlCredentials, '$1***@')
  );
};

/**
 * Runs a command with its output held in a private temporary file. Every attempt's
 * output goes through the workflow-output guard. A guard rejection fails at once
 * without retrying and without printing any output. Failed attempts that the guard
 * accepts are retried after the given delays. Only the last attempt's output tail
 * is printed, and only when every attempt has failed.
 *
 * @param {{
 *   command: string,
 *   args: readonly string[],
 *   attempts?: number,
 *   delaysMs?: readonly number[],
 *   tailLines?: number,
 *   sleep?: (ms: number) => Promise<unknown>,
 *   stdout?: (text: string) => void,
 *   stderr?: (text: string) => void,
 * }} input
 * @returns {Promise<number>}
 */
export const runGuardedWithRetry = async ({
  command,
  args,
  attempts = 3,
  delaysMs = [15_000, 30_000],
  tailLines = 40,
  sleep = delay,
  stdout = (text) => process.stdout.write(text),
  stderr = (text) => process.stderr.write(text),
}) => {
  const description = [command, ...args].join(' ');
  const directory = await mkdtemp(join(tmpdir(), 'guarded-retry-'));
  try {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const file = join(directory, `output-${attempt}`);
      const descriptor = openSync(file, 'w', 0o600);
      let status;
      try {
        status = spawnSync(command, args, { stdio: ['inherit', descriptor, descriptor] }).status ?? 1;
      } finally {
        closeSync(descriptor);
      }
      const output = readFileSync(file, 'utf8');
      const guardStatus = runGuard(output, stderr);
      if (guardStatus !== 0) {
        stderr(`Guarded command failed: exit=${status} guard=${guardStatus} command=${description}\n`);
        return guardStatus;
      }
      if (status === 0) {
        if (attempt > 1) stdout(`Guarded command succeeded on attempt ${attempt} of ${attempts}: ${description}\n`);
        return 0;
      }
      stderr(`Guarded command attempt ${attempt} of ${attempts} failed: kind=${classifyFailure(output)}\n`);
      if (attempt < attempts) {
        const waitMs = delaysMs[attempt - 1] ?? 0;
        stdout(
          `Guarded command attempt ${attempt} of ${attempts} failed with exit=${status}; retrying in ${
            waitMs / 1000
          }s: ${description}\n`,
        );
        await sleep(waitMs);
        continue;
      }
      const tail = tailOf(output, tailLines);
      const tailGuardStatus = tail.length > 0 ? runGuard(tail.join('\n'), stderr) : 0;
      if (tailGuardStatus !== 0) {
        stderr(`Guarded command failed: exit=${status} guard=${tailGuardStatus} command=${description}\n`);
        return tailGuardStatus;
      }
      if (tail.length > 0) {
        const token = randomUUID();
        stderr(
          `Last ${tail.length} lines of the output of attempt ${attempt} of ${attempts}:\n::stop-commands::${token}\n${
            tail.map((line) => `| ${line}\n`).join('')
          }::${token}::\n`,
        );
      }
      stderr(`Guarded command failed: exit=${status} guard=${guardStatus} command=${description}\n`);
      return status;
    }
    return 1;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [command, ...args] = process.argv.slice(2);
  if (command === undefined) {
    console.error('Usage: run-guarded-retry.mjs <command> [args...]');
    process.exitCode = 2;
  } else {
    process.exitCode = await runGuardedWithRetry({ command, args });
  }
}
