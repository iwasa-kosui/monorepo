import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runGuardedWithRetry } from '../run-guarded-retry.mjs';

const scriptPath = resolve(process.cwd(), 'scripts/run-guarded-retry.mjs');
const counterProgram = [
  'const fs = require("node:fs");',
  'const file = process.argv[2];',
  'const succeedAt = Number(process.argv[3]);',
  'const n = (fs.existsSync(file) ? Number(fs.readFileSync(file, "utf8")) : 0) + 1;',
  'fs.writeFileSync(file, String(n));',
  'const extra = n === 2 ? (process.env.FAKE_EXTRA ?? "") : "";',
  'process.stdout.write((process.env.FAKE_BODY ?? "").replaceAll("{n}", String(n)) + extra);',
  'process.exit(n >= succeedAt ? 0 : 1);',
].join('\n');

describe('runGuardedWithRetry', () => {
  let directory: string;
  let counter: string;
  let sleeps: number[];
  let stdout: string;
  let stderr: string;
  let program: string;
  const originalTmpdir = process.env.TMPDIR;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'retry-test-'));
    process.env.TMPDIR = directory;
    counter = join(directory, 'counter');
    program = join(directory, 'fake-command.cjs');
    await writeFile(program, counterProgram);
    sleeps = [];
    stdout = '';
    stderr = '';
  });
  afterEach(async () => {
    if (originalTmpdir === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = originalTmpdir;
    delete process.env.FAKE_BODY;
    delete process.env.FAKE_EXTRA;
    await rm(directory, { recursive: true, force: true });
  });

  const attempts = () => (existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0);
  const run = (succeedAt: number, body: string, options: { tailLines?: number; extraAtSecond?: string } = {}) => {
    process.env.FAKE_BODY = body;
    if (options.extraAtSecond !== undefined) process.env.FAKE_EXTRA = options.extraAtSecond;
    return runGuardedWithRetry({
      command: process.execPath,
      args: [program, counter, String(succeedAt)],
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      stdout: (text) => {
        stdout += text;
      },
      stderr: (text) => {
        stderr += text;
      },
      ...(options.tailLines === undefined ? {} : { tailLines: options.tailLines }),
    });
  };

  it('succeeds without output when the first attempt passes', async () => {
    expect(await run(1, 'ok {n}\n')).toBe(0);
    expect(attempts()).toBe(1);
    expect(sleeps).toEqual([]);
    expect(stdout).toBe('');
    expect(stderr).toBe('');
  });

  it('retries after the first failure and reports the attempt number without the output', async () => {
    expect(await run(2, 'BODY-MARKER-{n}\n')).toBe(0);
    expect(attempts()).toBe(2);
    expect(sleeps).toEqual([15_000]);
    expect(stdout).toContain('attempt 1 of 3 failed with exit=1; retrying in 15s');
    expect(stdout).toContain('succeeded on attempt 2 of 3');
    expect(stdout.trimEnd().split('\n')).toHaveLength(2);
    expect(stdout + stderr).not.toContain('BODY-MARKER');
    expect(stderr).toBe('');
  });

  it('waits 15 and 30 seconds, then prints only the tail of the last attempt when every attempt fails', async () => {
    const body = Array.from({ length: 10 }, (_, index) => `line-${index} attempt-{n}\n`).join('');
    expect(await run(99, body, { tailLines: 3 })).toBe(1);
    expect(attempts()).toBe(3);
    expect(sleeps).toEqual([15_000, 30_000]);
    expect(stdout).not.toContain('line-');
    expect(stderr).toContain('Last 3 lines of the output of attempt 3 of 3');
    expect(stderr).toContain('| line-9 attempt-3\n');
    expect(stderr).toContain('| line-7 attempt-3\n');
    expect(stderr).not.toContain('line-6');
    expect(stderr).not.toContain('attempt-1');
    expect(stderr).not.toContain('attempt-2');
    expect(stderr).toMatch(/Guarded command failed: exit=1 guard=0 command=.+\n$/);
  });

  it('does not retry and prints no output when the guard rejects the first attempt', async () => {
    expect(await run(99, 'CLOUDFLARE_API_TOKEN=leak-marker-value\n')).toBe(1);
    expect(attempts()).toBe(1);
    expect(sleeps).toEqual([]);
    expect(stderr).toContain('Unsafe workflow output: Cloudflare API token');
    expect(stderr).toContain('Guarded command failed: exit=1 guard=1 command=');
    expect(stdout + stderr).not.toContain('leak-marker-value');
    expect(stderr).not.toContain('Last ');
  });

  it('stops retrying and prints no output when the guard rejects a later attempt', async () => {
    expect(await run(99, 'plain output {n}\n', { extraAtSecond: 'CLOUDFLARE_API_TOKEN=leak-marker-value\n' })).toBe(1);
    expect(attempts()).toBe(2);
    expect(sleeps).toEqual([15_000]);
    expect(stderr).toContain('Guarded command failed: exit=1 guard=1 command=');
    expect(stdout + stderr).not.toContain('leak-marker-value');
    expect(stdout + stderr).not.toContain('plain output');
  });

  it('fails a successful command whose output the guard rejects, without printing the output', async () => {
    expect(await run(1, 'VAPID_PRIVATE_KEY=leak-marker-value\n')).toBe(1);
    expect(attempts()).toBe(1);
    expect(stderr).toContain('Guarded command failed: exit=0 guard=1 command=');
    expect(stdout + stderr).not.toContain('leak-marker-value');
  });

  it('neutralizes workflow commands and control characters in the printed output', async () => {
    const body = [
      '::error::boom',
      '##[error]boom',
      '::set-env name=A::b',
      'text\r::warning::carriage-return',
      '\u001b[31mred\u001b[0m',
      '  ::add-mask::value',
      '',
    ].join('\n');
    expect(await run(99, body)).toBe(1);
    const lines = stderr.split('\n');
    const open = lines.findIndex(line => line.startsWith('::stop-commands::'));
    const token = lines[open].slice('::stop-commands::'.length);
    const close = lines.indexOf(`::${token}::`);
    expect(open).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(open);
    const printed = lines.slice(open + 1, close);
    expect(printed.length).toBeGreaterThanOrEqual(6);
    for (const line of printed) expect(line.startsWith('| ')).toBe(true);
    expect(printed).toContain('| ::error::boom');
    expect(printed).toContain('| text');
    expect(printed).toContain('| ::warning::carriage-return');
    expect(/\p{Cc}/u.test(stderr.replaceAll('\n', ''))).toBe(false);
    expect(lines.slice(0, open).concat(lines.slice(close + 1)).filter(line => line.startsWith('::'))).toEqual([]);
  });

  it('removes credentials embedded in URLs from the printed output', async () => {
    expect(await run(99, 'GET https://user:url-secret-pw@registry.example.invalid/v1 failed\n')).toBe(1);
    expect(stderr).toContain('| GET https://***@registry.example.invalid/v1 failed');
    expect(stderr).not.toContain('url-secret-pw');
  });

  it('removes everything after the last @ of the credentials in a URL', async () => {
    expect(await run(99, 'GET https://user:p@ss@registry.example.invalid/v1 failed\n')).toBe(1);
    expect(stderr).toContain('| GET https://***@registry.example.invalid/v1 failed');
    expect(stderr).not.toContain('p@ss');
    expect(stderr).not.toContain('ss@');
  });

  it('rejects a tail that only matches the guard after sanitizing, without printing it', async () => {
    expect(await run(99, 'CLOUDFLARE_API_\u0001TOKEN=leak-marker-value\n')).toBe(1);
    expect(attempts()).toBe(3);
    expect(stderr).toContain('Unsafe workflow output: Cloudflare API token');
    expect(stderr).toContain('Guarded command failed: exit=1 guard=1 command=');
    expect(stderr).not.toContain('guard=0');
    expect(stdout + stderr).not.toContain('leak-marker-value');
    expect(stdout + stderr).not.toContain('Last ');
    expect(stdout + stderr).not.toContain('::stop-commands::');
  });

  it('removes its temporary files after success, retry and failure', async () => {
    await run(1, 'ok\n');
    await rm(counter);
    await run(2, 'ok\n');
    await rm(counter);
    await run(99, 'ng\n');
    expect((await readdir(directory)).filter(name => name.startsWith('guarded-retry-'))).toEqual([]);
  });
});

describe('run-guarded-retry command line', () => {
  it('runs the given command and returns its success', () => {
    const result = spawnSync(process.execPath, [scriptPath, process.execPath, '-e', 'process.stdout.write("fine")'], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it('refuses to run without a command', () => {
    const result = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Usage:');
  });
});
