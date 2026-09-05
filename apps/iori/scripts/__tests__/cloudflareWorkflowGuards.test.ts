import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { parse } from 'yaml';

type Step = {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
};
type Job = {
  'runs-on': string;
  'timeout-minutes': number;
  needs?: string | string[];
  environment?: string;
  if?: string;
  steps: Step[];
};
type Workflow = {
  on: object;
  jobs: Record<string, Job>;
  concurrency: { group: string; 'cancel-in-progress': boolean };
  env?: Record<string, string>;
};
const repositoryRoot = resolve(process.cwd(), '..', '..');
const readWorkflow = async (name: string) =>
  parse(await readFile(resolve(repositoryRoot, '.github/workflows', name), 'utf8')) as Workflow;
const operation = (job: Job) => job.steps.find(step => step.run?.endsWith('hosted-workflow.mjs operate'))!;
it('runs every protected role on hosted isolated jobs after the public gate and fresh readonly verify before cutover', async () => {
  const workflow = await readWorkflow('deploy-iori-worker.yml');
  expect(Object.keys(workflow.jobs)).toEqual([
    'public-artifact-gate',
    'prepare-target',
    'migrate-data',
    'verify-import',
    'cutover-route',
    'deploy-worker',
  ]);
  for (const [name, job] of Object.entries(workflow.jobs)) {
    expect(job['runs-on']).toBe('ubuntu-latest');
    expect(job['timeout-minutes']).toBeLessThanOrEqual(360);
    expect(job.steps[0].run).toContain('IORI_JOB_STARTED_AT');
    expect(job.steps[0].run).toContain('refs/heads/main');
    expect(job.steps[0].run).toContain('Maintenance operation requires a separate review.');
    expect(job.steps.find(step => step.uses?.startsWith('actions/checkout'))?.with?.ref).toBe('${{ github.sha }}');
    expect(job.steps.find(step => step.uses?.startsWith('actions/setup-node'))?.with?.['node-version']).toBe('24.12.0');
    expect(job.steps.some(step => step.run === 'node apps/iori/scripts/hosted-workflow.mjs init')).toBe(true);
    expect(job.steps.at(-1)?.if).toBe('always() && env.IORI_PRIVATE_DIRECTORY != \'\'');
    expect(job.steps.at(-1)?.run).toContain('cleanup-private-workflow-directory.mjs');
    if (name !== 'public-artifact-gate') {
      expect([job.needs].flat()).toContain('public-artifact-gate');
      expect(job.environment).toBe('${{ inputs.environment }}');
      expect(job.steps.find(step => step.uses?.startsWith('hashicorp/setup-terraform'))?.with?.terraform_wrapper).toBe(
        false,
      );
    }
  }
  expect(workflow.jobs['cutover-route'].needs).toEqual(['public-artifact-gate', 'verify-import']);
  expect(workflow.jobs['verify-import'].if).toContain('inputs.operation == \'cutover-route\'');
  expect(operation(workflow.jobs['verify-import']).env?.IORI_OPERATION).toBe('verify-import');
});
it('scopes signing and write credentials to the exact roles, without mounted secret paths or public caches', async () => {
  const workflow = await readWorkflow('deploy-iori-worker.yml');
  const prepare = operation(workflow.jobs['prepare-target']).env!;
  const migrate = operation(workflow.jobs['migrate-data']).env!;
  const verify = operation(workflow.jobs['verify-import']).env!;
  const cutover = operation(workflow.jobs['cutover-route']).env!;
  const deploy = operation(workflow.jobs['deploy-worker']).env!;
  expect(prepare.SMOKE_QUEUE_TOKEN).toBe('${{ secrets.SMOKE_QUEUE_TOKEN }}');
  expect(prepare.IORI_MIGRATION_RECEIPT_PRIVATE_KEY).toBeUndefined();
  expect(migrate.IORI_MIGRATION_RECEIPT_PRIVATE_KEY).toBe('${{ secrets.IORI_MIGRATION_RECEIPT_PRIVATE_KEY }}');
  expect(migrate.IORI_APPLICATION_R2_ACCESS_KEY_ID).toContain('WRITE');
  for (const role of [verify, cutover]) {
    expect(role.IORI_MIGRATION_RECEIPT_PRIVATE_KEY).toBeUndefined();
    expect(role.IORI_APPLICATION_R2_ACCESS_KEY_ID).toContain('READ_ONLY');
    expect(role.IORI_MIGRATION_R2_ACCESS_KEY_ID).toContain('READ_ONLY');
  }
  expect(verify.CLOUDFLARE_API_TOKEN).toContain('VERIFY_API_TOKEN');
  expect(verify.AWS_ACCESS_KEY_ID).toContain('READ_ONLY');
  expect(verify.IORI_SOURCE_SSH_PRIVATE_KEY).toBeUndefined();
  expect(cutover.CLOUDFLARE_API_TOKEN).toContain('CUTOVER_API_TOKEN');
  expect(cutover.AWS_ACCESS_KEY_ID).toContain('WRITE');
  expect(deploy.VAPID_PRIVATE_KEY).toBeUndefined();
  expect(deploy.IORI_SOURCE_SSH_PRIVATE_KEY).toBeUndefined();
  expect(deploy.AWS_ACCESS_KEY_ID).toContain('READ_ONLY');
  const text = JSON.stringify(workflow);
  expect(text).not.toMatch(
    /self-hosted|upload-artifact|download-artifact|IORI_IMPORT_RUNNER|secrets\.[A-Z_]+_PATH|QUEUE_PRODUCER_REMOVED|ssh-keyscan|DATABASE_URL|DB_PASSWORD/,
  );
  expect(Object.values(workflow.jobs).flatMap(job => job.steps).filter(step => step.uses?.includes('cache')))
    .toHaveLength(0);
});
it('shares exact production source serialization and delegates to early guarded fixed source deployment', async () => {
  const [worker, source] = await Promise.all([readWorkflow('deploy-iori-worker.yml'), readWorkflow('deploy-iori.yml')]);
  expect(worker.concurrency.group).toBe(source.concurrency.group);
  expect(worker.concurrency.group).toBe('deploy-iori-worker-production');
  expect(worker.concurrency.group).not.toMatch(/environment|generation|\$\{/);
  expect(source.concurrency).toEqual({ group: 'deploy-iori-worker-production', 'cancel-in-progress': false });
  expect(worker.concurrency['cancel-in-progress']).toBe(false);
  const job = source.jobs['build-and-deploy'];
  expect(job.environment).toBe('production');
  expect(job.steps[0].run).toContain('IORI_JOB_STARTED_AT');
  expect(Object.keys(operation(job).env!)).toEqual([
    'IORI_SOURCE_SSH_HOST',
    'IORI_SOURCE_SSH_USER',
    'IORI_SOURCE_SSH_PRIVATE_KEY',
    'IORI_SOURCE_SSH_KNOWN_HOSTS',
  ]);
  const sourceScript = await readFile(resolve(repositoryRoot, 'apps/iori/scripts/deploy-source.mjs'), 'utf8');
  expect(sourceScript.indexOf('remote(\'check\')')).toBeLessThan(sourceScript.indexOf('remote(\'checkout\')'));
  expect(sourceScript.indexOf('remote(\'dist-check\')')).toBeLessThan(sourceScript.indexOf('execute(\'rsync\''));
});
it('wires real credential-free fixture execution, explicit portable PostgreSQL opt-in and sealed CI identity', async () => {
  const ci = await readWorkflow('ci.yml');
  const steps = ci.jobs.iori.steps;
  expect(steps.find(step => step.uses?.startsWith('hashicorp/setup-terraform'))?.with?.terraform_wrapper).toBe(false);
  expect(steps.some(step => step.run === 'node apps/iori/scripts/run-migration-fixture.mjs')).toBe(true);
  expect(steps.some(step => step.run?.includes('docker pull postgres:16'))).toBe(true);
  expect(steps.find(step => step.env?.IORI_RUN_POSTGRES_FIXTURE === '1')?.run).toContain(
    'sourcePostgresIntegration.test.ts',
  );
  const guard = steps.find(step => step.name === 'Run guarded Cloudflare checks')!.run!;
  expect(guard).toContain('IORI_ADMISSION_MODE=sealed');
  expect(guard).toContain('iori-staging-fixture1');
  expect(guard).toContain('IORI_ADMISSION_IDENTITY=');
  expect(guard).toContain('assert-workflow-output.mjs');
});
it('constructs the CI admission as a validated synthetic sealed identity', async () => {
  const { execFileSync } = await import('node:child_process');
  const { parseAdmission } = await import('../../src/workerAdmission.ts');
  const ci = await readWorkflow('ci.yml');
  const script = ci.jobs.iori.steps.find(step => step.name === 'Run guarded Cloudflare checks')!.run!;
  const fixedFixture = script.split('\n').filter(line =>
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
