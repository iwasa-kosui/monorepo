import { execFile } from 'node:child_process';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, expect, it, vi } from 'vitest';

import { publishChildDiagnostics } from '../hosted-workflow.mjs';
import { runInfrastructureCommand } from '../infrastructure-command.mjs';
import { readMigrationTarget } from '../read-migration-target.mjs';
import { classifyTerraformFailure, READ_TARGET_STEPS, readTargetFailureLine } from '../read-target-diagnostics.mjs';
import { createFixtureDirectory } from './fixtureTemp.js';
import { targetOutputsFixture } from './migrationTargetFixture.js';

vi.mock('../infrastructure-command.mjs', () => ({ runInfrastructureCommand: vi.fn() }));

const publicLine =
  /^IORI_DIAG stage=[a-z-]{1,24} program=(?:ssh|rsync|terraform|node|none) exit=(?:\d{1,3}|none) signal=(?:[A-Z0-9]{1,12}|none) reason=[a-z0-9-]{1,40}$/;
const secretBody = 'secret-bucket-name 0123456789abcdef /home/runner/work/secret-path';
const boxed = (lines: string[]) => lines.map(line => `│ ${line}`).join('\n');
afterEach(() => {
  vi.restoreAllMocks();
});
it.each([
  [
    'an S3 access denial',
    `Error: Failed to load state: operation error S3: GetObject, api error AccessDenied: ${secretBody}`,
    'terraform-auth',
  ],
  [
    'an invalid access key',
    'api error InvalidAccessKeyId: The Access Key Id you provided does not exist',
    'terraform-auth',
  ],
  ['a bad signature', 'api error SignatureDoesNotMatch: request signature we calculated', 'terraform-auth'],
  ['an HTTP 403 status', 'https response error StatusCode: 403, RequestID: abc', 'terraform-auth'],
  ['an HTTP 401 status', 'https response error StatusCode: 401, RequestID: abc', 'terraform-auth'],
  ['missing credentials', 'Error: No valid credential sources found', 'terraform-auth'],
  ['an unresolved host', 'dial tcp: lookup example.invalid: no such host', 'terraform-unreachable'],
  ['a refused connection', 'dial tcp 192.0.2.1:443: connect: connection refused', 'terraform-unreachable'],
  ['a timeout', 'read tcp 192.0.2.1:443: i/o timeout', 'terraform-unreachable'],
  ['a deadline', 'context deadline exceeded', 'terraform-unreachable'],
  ['a failed request', 'RequestError: send request failed', 'terraform-unreachable'],
  [
    'a checksum mismatch',
    'the cached package for registry.terraform.io/cloudflare/cloudflare 5.23.0 does not match any of the checksums recorded in the dependency lock file',
    'terraform-lock',
  ],
  ['missing plugins', 'Error: Required plugins are not installed', 'terraform-lock'],
  ['an inconsistent lock', 'Error: Inconsistent dependency lock file', 'terraform-lock'],
  ['an unknown failure', `Error: something unexpected ${secretBody}`, 'terraform-other'],
  ['empty output', '', 'terraform-other'],
])('classifies %s as %s', (_label, stderr, reason) => {
  expect(classifyTerraformFailure(stderr)).toBe(reason);
});
it('matches Terraform messages that are wrapped, boxed and colored', () => {
  const wrapped = boxed([
    '\u001b[1m\u001b[31mError: \u001b[0m\u001b[0m\u001b[1mRequired plugins are not installed\u001b[0m',
    '',
    'registry.terraform.io/cloudflare/cloudflare: the cached package for 5.23.0 does not match any of the',
    'checksums recorded in the dependency lock file',
  ]);
  expect(classifyTerraformFailure(wrapped)).toBe('terraform-lock');
  expect(
    classifyTerraformFailure(
      boxed(['Error: operation error S3: ListObjectsV2, https response error', 'StatusCode: 403']),
    ),
  ).toBe(
    'terraform-auth',
  );
});
it('prefers the lock, then authentication, then reachability when several patterns match', () => {
  expect(classifyTerraformFailure('AccessDenied no such host Inconsistent dependency lock file')).toBe(
    'terraform-lock',
  );
  expect(classifyTerraformFailure('no such host AccessDenied')).toBe('terraform-auth');
});
it('keeps the step vocabulary fixed', () => {
  expect(READ_TARGET_STEPS).toEqual([
    'config',
    'path',
    'tf-setup',
    'tf-init',
    'tf-show',
    'tf-output',
    'output-check',
    'expected',
    'write',
  ]);
});
it.each(READ_TARGET_STEPS)('builds a public line for the step %s', (step) => {
  const line = readTargetFailureLine(step, new Error('Target setup configuration is required.'));
  expect(line).toBe(`IORI_DIAG stage=target-read-${step} program=none exit=none signal=none reason=config-invalid`);
  expect(line).toMatch(publicLine);
});
it.each(['unknown', '', undefined, null, 'https://secret.invalid'])(
  'reports the step %j outside the list as unclassified',
  (step) => {
    const line = readTargetFailureLine(step, new Error('x'));
    expect(line).toBe(
      'IORI_DIAG stage=target-read-unclassified program=none exit=none signal=none reason=unclassified',
    );
    expect(line).toMatch(publicLine);
  },
);
it('prints the Terraform exit code and signal only for a Terraform reason', () => {
  const terraform = Object.assign(new Error(secretBody), {
    diagnostic: { reason: 'terraform-auth' },
    exitCode: 1,
    signal: null,
  });
  expect(readTargetFailureLine('tf-init', terraform)).toBe(
    'IORI_DIAG stage=target-read-tf-init program=terraform exit=1 signal=none reason=terraform-auth',
  );
  expect(
    readTargetFailureLine('tf-show', {
      ...terraform,
      exitCode: null,
      signal: 'SIGTERM',
      diagnostic: { reason: 'terraform-other' },
    }),
  ).toBe(
    'IORI_DIAG stage=target-read-tf-show program=terraform exit=none signal=SIGTERM reason=terraform-other',
  );
  const other = Object.assign(new Error('x'), {
    diagnostic: { reason: 'output-mismatch' },
    exitCode: 1,
    signal: 'SIGTERM',
  });
  expect(readTargetFailureLine('output-check', other)).toBe(
    'IORI_DIAG stage=target-read-output-check program=none exit=none signal=none reason=output-mismatch',
  );
  for (const line of [readTargetFailureLine('tf-init', terraform), readTargetFailureLine('tf-init', other)]) {
    expect(line).not.toContain('secret');
  }
});
it('drops an exit code or signal outside the public shape', () => {
  const error = Object.assign(new Error('x'), {
    diagnostic: { reason: 'terraform-other' },
    exitCode: 4096,
    signal: 'sigterm',
  });
  expect(readTargetFailureLine('tf-init', error)).toBe(
    'IORI_DIAG stage=target-read-tf-init program=terraform exit=none signal=none reason=terraform-other',
  );
});
type Step = { stdout?: string; stderr?: string; fail?: boolean };
type Scenario = Partial<Record<'init' | 'show' | 'output', Step>>;
const fixture = targetOutputsFixture();
const terraformOutputs = (mutate?: (outputs: typeof fixture.outputs) => void) => {
  const outputs = structuredClone(fixture.outputs);
  mutate?.(outputs);
  return JSON.stringify({
    worker_bindings: { value: outputs.workerBindings },
    migration_storage: { value: outputs.migrationStorage },
    target_identity: { value: outputs.targetIdentity },
  });
};
const existingState = JSON.stringify({ values: { root_module: { resources: [{ address: 'existing' }] } } });
const failure = (exitCode: number | null, signal: string | null) =>
  Object.assign(new Error('Migration command failed; outcome may be uncertain.'), { exitCode, signal });
const useTerraform = (scenario: Scenario) => {
  vi.mocked(runInfrastructureCommand).mockImplementation(
    (async (
      _program: string,
      args: string[],
      options: { inspectOutput?: (result: { stdout: string; stderr: string }) => void },
    ) => {
      const step = scenario[args[1] as keyof Scenario];
      const result = { stdout: step?.stdout ?? '', stderr: step?.stderr ?? '' };
      options.inspectOutput?.(result);
      if (step?.fail) throw failure(1, null);
      return { status: 0, ...result };
    }) as unknown as typeof runInfrastructureCommand,
  );
};
const targetEnvironment = () => ({
  IORI_ENVIRONMENT: fixture.target.identity.environment,
  IORI_GENERATION: fixture.target.identity.generation,
  CLOUDFLARE_ACCOUNT_ID: fixture.target.identity.account_id,
  IORI_TERRAFORM_BACKEND_BUCKET: fixture.target.identity.backend_bucket,
  MAIN_SHA: fixture.target.identity.main_sha,
  IORI_MIGRATION_RUN_ID: fixture.target.identity.run_id,
  CLOUDFLARE_ZONE_ID: 'b'.repeat(32),
  IORI_ADMISSION_IDENTITY: JSON.stringify(fixture.target.admission),
  ORIGIN: `https://${fixture.target.admission.hostname}`,
  CLOUDFLARE_API_TOKEN: 'synthetic-api-token',
});
const readTarget = async (scenario: Scenario, change: { env?: Record<string, string>; pathExists?: boolean } = {}) => {
  useTerraform(scenario);
  const directory = await createFixtureDirectory('iori-read-target-');
  try {
    const path = join(directory, 'expected-target.json');
    if (change.pathExists) await writeFile(path, '{}', { mode: 0o600 });
    const stages: string[] = [];
    const error = await readMigrationTarget(
      {
        ...targetEnvironment(),
        IORI_MIGRATION_EXPECTED_TARGET_PATH: path,
        ...change.env,
      },
      new AbortController().signal,
      (stage: string) => stages.push(stage),
    ).then(() => undefined, (reason: unknown) => reason);
    const written = error === undefined ? await readFile(path, 'utf8') : undefined;
    return { error, stages, line: readTargetFailureLine(stages.at(-1), error), written };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
const good: Scenario = { show: { stdout: existingState }, output: { stdout: terraformOutputs() } };
it('reads the established target through every step and reports no failure line', async () => {
  const result = await readTarget(good);
  expect(result.error).toBeUndefined();
  expect(result.stages).toEqual([
    'config',
    'path',
    'tf-setup',
    'tf-init',
    'tf-show',
    'tf-output',
    'output-check',
    'expected',
    'write',
  ]);
  expect(JSON.parse(result.written!)).toEqual(fixture.target);
});
it('names the configuration step when the setup configuration is missing', async () => {
  const result = await readTarget(good, { env: { CLOUDFLARE_ZONE_ID: '' } });
  expect(result.line).toBe(
    'IORI_DIAG stage=target-read-config program=none exit=none signal=none reason=config-invalid',
  );
});
it('names the path step when the expected target path is not allowed', async () => {
  const result = await readTarget(good, {
    env: { IORI_MIGRATION_EXPECTED_TARGET_PATH: fileURLToPath(import.meta.url) },
  });
  expect(result.line).toMatch(/^IORI_DIAG stage=target-read-path program=none exit=none signal=none reason=[a-z-]+$/);
});
it.each([
  ['init', 'AccessDenied', 'terraform-auth'],
  ['init', 'dial tcp: lookup example.invalid: no such host', 'terraform-unreachable'],
  ['init', 'Error: Inconsistent dependency lock file', 'terraform-lock'],
  ['init', `unexpected ${secretBody}`, 'terraform-other'],
  ['show', 'api error AccessDenied', 'terraform-auth'],
  ['output', 'Required plugins are not installed', 'terraform-lock'],
])('names the Terraform %s step and the %s failure class %s without the output text', async (step, stderr, reason) => {
  const result = await readTarget({
    ...good,
    [step]: { ...good[step as keyof Scenario], stderr: `${stderr} ${secretBody}`, fail: true },
  });
  expect(result.line).toBe(
    `IORI_DIAG stage=target-read-tf-${step} program=terraform exit=1 signal=none reason=${reason}`,
  );
  expect(result.line).not.toContain('secret');
  expect(result.line).toMatch(publicLine);
});
it('names the show step when the state output is not JSON or the state is empty', async () => {
  const invalid = await readTarget({ ...good, show: { stdout: '{not json' } });
  expect(invalid.line).toBe(
    'IORI_DIAG stage=target-read-tf-show program=none exit=none signal=none reason=output-invalid',
  );
  const empty = await readTarget({ ...good, show: { stdout: '{}' } });
  expect(empty.line).toBe(
    'IORI_DIAG stage=target-read-tf-show program=none exit=none signal=none reason=output-mismatch',
  );
});
it('names the output check step when the outputs are not JSON or do not match the identity', async () => {
  const invalid = await readTarget({ ...good, output: { stdout: '{not json' } });
  expect(invalid.line).toBe(
    'IORI_DIAG stage=target-read-output-check program=none exit=none signal=none reason=output-invalid',
  );
  const mismatch = await readTarget({
    ...good,
    output: { stdout: terraformOutputs(outputs => void (outputs.targetIdentity.backend_key = 'old')) },
  });
  expect(mismatch.line).toBe(
    'IORI_DIAG stage=target-read-output-check program=none exit=none signal=none reason=output-mismatch',
  );
});
it('names the expected target step when the outputs do not make a valid target', async () => {
  const result = await readTarget({
    ...good,
    output: { stdout: terraformOutputs(outputs => void (outputs.targetIdentity.consumer[0]!.settings.batch_size = 2)) },
  });
  expect(result.line).toBe(
    'IORI_DIAG stage=target-read-expected program=none exit=none signal=none reason=identity-mismatch',
  );
});
it('names the write step when the result file already exists', async () => {
  const result = await readTarget(good, { pathExists: true });
  expect(result.line).toMatch(/^IORI_DIAG stage=target-read-write program=none exit=none signal=none reason=[a-z-]+$/);
  expect(result.line).not.toContain('reason=terraform-');
});
it('prints only the fixed failure line for a Terraform authentication failure from the real command', async () => {
  const directory = await createFixtureDirectory('iori-read-target-cli-');
  try {
    const bin = join(directory, 'bin');
    await mkdir(bin);
    await writeFile(
      join(bin, 'terraform'),
      `#!/bin/sh\necho "Error: api error AccessDenied: ${secretBody}" >&2\nexit 1\n`,
    );
    await chmod(join(bin, 'terraform'), 0o755);
    const script = fileURLToPath(new URL('../read-migration-target.mjs', import.meta.url));
    const failed = await promisify(execFile)(process.execPath, [script], {
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        TMPDIR: directory,
        ...targetEnvironment(),
        IORI_MIGRATION_EXPECTED_TARGET_PATH: join(directory, 'expected-target.json'),
      },
    }).then(() => undefined, (reason: { stderr: string }) => reason);
    expect(failed?.stderr).toBe(
      'IORI_DIAG stage=target-read-tf-init program=terraform exit=1 signal=none reason=terraform-auth\n'
        + 'Established target read failed.\n',
    );
    const writes: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation(
      ((chunk: string | Uint8Array) => {
        writes.push(String(chunk));
        return true;
      }) as typeof process.stderr.write,
    );
    await publishChildDiagnostics(failed!.stderr);
    expect(writes).toEqual([
      'IORI_DIAG stage=target-read-tf-init program=terraform exit=1 signal=none reason=terraform-auth\n',
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
