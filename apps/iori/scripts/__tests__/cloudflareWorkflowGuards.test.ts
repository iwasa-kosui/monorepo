import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { parse } from 'yaml';

type Workflow = { jobs: Record<string, { steps: { name?: string; run?: string }[] }> };
const repositoryRoot = resolve(process.cwd(), '..', '..');
const guardedChecksScript = async () => {
  const ci = parse(await readFile(resolve(repositoryRoot, '.github/workflows/ci.yml'), 'utf8')) as Workflow;
  return ci.jobs.iori.steps.find(step => step.name === 'Run guarded Cloudflare checks')!.run!;
};
const runGuardedDefinition = async () => {
  const lines = (await guardedChecksScript()).split('\n');
  const start = lines.findIndex(line => line.trim() === 'run_guarded() {');
  const end = lines.findIndex((line, index) => index > start && line.trim() === '}');
  return lines.slice(start, end + 1).join('\n');
};
it('prints one fixed failure line to stderr without the command output when a guarded command fails', async () => {
  const { spawnSync } = await import('node:child_process');
  const definition = await runGuardedDefinition();
  const run = (command: string) =>
    spawnSync('bash', ['-c', `set -euo pipefail\n${definition}\n${command}`], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
  const failed = run(`run_guarded bash -c 'echo $((40+2)); exit 3'`);
  expect(failed.status).toBe(3);
  expect(failed.stderr).toContain('Guarded command failed: exit=3 guard=0 command=bash -c echo $((40+2)); exit 3\n');
  expect(failed.stderr).not.toContain('42');
  expect(failed.stdout).not.toContain('42');
  const passed = run('run_guarded true');
  expect(passed.status).toBe(0);
  expect(passed.stderr).not.toContain('Guarded command failed');
});
it('runs a failing guarded command exactly once', async () => {
  const { spawnSync } = await import('node:child_process');
  const definition = await runGuardedDefinition();
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const directory = mkdtempSync(resolve(tmpdir(), 'run-guarded-once-'));
  const countFile = resolve(directory, 'count');
  try {
    const result = spawnSync('bash', [
      '-c',
      `${definition}\nrun_guarded bash -c 'echo run >> "$0"; exit 1' "$1" || true`,
      'bash',
      countFile,
    ], { cwd: repositoryRoot, encoding: 'utf8' });
    expect(result.stderr).toContain('Guarded command failed: exit=1 guard=0');
    expect(readFileSync(countFile, 'utf8')).toBe('run\n');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
it('constructs the CI admission as a validated synthetic sealed identity', async () => {
  const { execFileSync } = await import('node:child_process');
  const { parseAdmission } = await import('../../src/workerAdmission.ts');
  const fixedFixture = (await guardedChecksScript()).split('\n').filter(line =>
    /^\s*(iori_fixture_marker=|export IORI_ADMISSION_IDENTITY=)/.test(line)
  ).join('\n');
  const identity = execFileSync('bash', ['-c', `${fixedFixture}\nprintf '%s' "$IORI_ADMISSION_IDENTITY"`], {
    encoding: 'utf8',
  });
  expect(
    parseAdmission({
      IORI_ADMISSION_MODE: 'sealed',
      IORI_ADMISSION_IDENTITY: identity,
      ORIGIN: 'https://iori.example.invalid',
    }),
  ).toMatchObject({ mode: 'sealed', environment: 'staging', generation: 'fixture1' });
});
