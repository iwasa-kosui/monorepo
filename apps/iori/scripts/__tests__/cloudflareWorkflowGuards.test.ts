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
it('runs every protected role on hosted isolated jobs after the public gate', async () => {
  const workflow = await readWorkflow('deploy-iori-worker.yml');
  expect(Object.keys(workflow.jobs)).toEqual([
    'public-artifact-gate',
    'deploy-worker',
    'put-worker-secrets',
    'put-bluesky-secrets',
    'put-twitterapi-secret',
    'delete-rehearsal-d1',
    'move-unfollowed-reposts-dry-run',
    'move-unfollowed-reposts',
    'delete-unfollowed-posts-dry-run',
    'delete-unfollowed-posts',
    'domain-events-stats',
    'digest-quality-sample',
    'prune-federated-posts-dry-run',
    'ensure-event-archive-bucket',
    'delete-blocked-domain-posts-dry-run',
    'delete-blocked-domain-posts',
    'recover-source',
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
      expect(job.steps.some(step => step.uses?.startsWith('hashicorp/setup-terraform'))).toBe(false);
    }
  }
});
it('keeps the deploy-worker role without SSH or Terraform credentials, mounted secret paths or public caches', async () => {
  const workflow = await readWorkflow('deploy-iori-worker.yml');
  const deploy = operation(workflow.jobs['deploy-worker']).env!;
  expect(deploy.VAPID_PRIVATE_KEY).toBeUndefined();
  expect(deploy.IORI_SOURCE_SSH_PRIVATE_KEY).toBeUndefined();
  expect(Object.keys(deploy).filter(key => /AWS_|TERRAFORM|IORI_MIGRATION_R2/.test(key))).toEqual([]);
  const text = JSON.stringify(workflow);
  expect(text).not.toMatch(
    /self-hosted|upload-artifact|download-artifact|IORI_IMPORT_RUNNER|secrets\.[A-Z_]+_PATH|QUEUE_PRODUCER_REMOVED|ssh-keyscan|DATABASE_URL|DB_PASSWORD/,
  );
  expect(Object.values(workflow.jobs).flatMap(job => job.steps).filter(step => step.uses?.includes('cache')))
    .toHaveLength(0);
});
it('runs the source recovery operations in one approved job holding only the source SSH secrets', async () => {
  const workflow = await readWorkflow('deploy-iori-worker.yml');
  const job = workflow.jobs['recover-source'];
  expect(job.if).toBe(
    'inputs.operation == \'resume-source\' || inputs.operation == \'release-pending-freeze\' || inputs.operation == \'restart-failed-source\' || inputs.operation == \'diagnose-source\'',
  );
  expect([job.needs].flat()).toEqual(['public-artifact-gate']);
  expect(job.environment).toBe('${{ inputs.environment }}');
  expect(operation(job).env).toEqual({
    IORI_SOURCE_SSH_HOST: '${{ secrets.IORI_SOURCE_SSH_HOST }}',
    IORI_SOURCE_SSH_USER: '${{ secrets.IORI_SOURCE_SSH_USER }}',
    IORI_SOURCE_SSH_PRIVATE_KEY: '${{ secrets.IORI_SOURCE_SSH_PRIVATE_KEY }}',
    IORI_SOURCE_SSH_KNOWN_HOSTS: '${{ secrets.IORI_SOURCE_SSH_KNOWN_HOSTS }}',
  });
  expect(workflow.concurrency.group).toBe('deploy-iori-worker-production');
});
it('exposes the recovery operations and inputs without a default recovery value', async () => {
  const text = await readFile(resolve(repositoryRoot, '.github/workflows/deploy-iori-worker.yml'), 'utf8');
  const workflow = parse(text) as {
    on: {
      workflow_dispatch: {
        inputs: Record<string, { required?: boolean; type?: string; default?: unknown; options?: string[] }>;
      };
    };
    env: Record<string, string>;
  };
  const inputs = workflow.on.workflow_dispatch.inputs;
  expect(inputs.operation.options).toEqual(
    expect.arrayContaining([
      'resume-source',
      'release-pending-freeze',
      'restart-failed-source',
      'diagnose-source',
      'reconcile-resources',
      'replace-queue-consumer',
      'delete-rehearsal-d1',
    ]),
  );
  expect(inputs.recovery).toEqual({ description: expect.any(String), required: false, type: 'string' });
  expect(inputs.recovery.default).toBeUndefined();
  expect(inputs.migration_main_sha.required).toBe(false);
  expect(inputs.migration_run_id.required).toBe(false);
  expect(workflow.env.IORI_RECOVERY).toBe('${{ inputs.recovery }}');
  expect(workflow.env.IORI_MIGRATION_MAIN_SHA).toBe('${{ inputs.migration_main_sha }}');
  expect(workflow.env.IORI_MIGRATION_RUN_ID).toBe('${{ inputs.migration_run_id }}');
});
it('gives put-worker-secrets only the deploy token, the account and admission identity, and the values to put', async () => {
  const workflow = await readWorkflow('deploy-iori-worker.yml');
  const job = workflow.jobs['put-worker-secrets'];
  const secret = (name: string) => `\${{ secrets.${name} }}`;
  expect(job.if).toBe('inputs.operation == \'put-worker-secrets\'');
  expect(job.needs).toBe('public-artifact-gate');
  expect(job.environment).toBe('${{ inputs.environment }}');
  expect(operation(job).env).toEqual({
    CLOUDFLARE_ACCOUNT_ID: secret('CLOUDFLARE_ACCOUNT_ID'),
    IORI_ADMISSION_IDENTITY: secret('IORI_ADMISSION_IDENTITY'),
    CLOUDFLARE_API_TOKEN: secret('IORI_CLOUDFLARE_DEPLOY_API_TOKEN'),
    VAPID_PUBLIC_KEY: secret('VAPID_PUBLIC_KEY'),
    VAPID_PRIVATE_KEY: secret('VAPID_PRIVATE_KEY'),
    SMOKE_QUEUE_TOKEN: secret('SMOKE_QUEUE_TOKEN'),
    TWITTERAPI_IO_API_KEY: secret('TWITTERAPI_IO_API_KEY'),
    BLUESKY_IDENTIFIER: secret('BLUESKY_IDENTIFIER'),
    BLUESKY_APP_PASSWORD: secret('BLUESKY_APP_PASSWORD'),
  });
  expect(JSON.stringify(job.steps.filter(step => step !== operation(job)))).not.toContain('secrets.');
  expect(JSON.stringify(job)).not.toMatch(/SSH|RECEIPT|R2|TERRAFORM|AWS_|STAGING_ACCESS_TOKEN|setup-terraform/);
  const inputs =
    (workflow.on as { workflow_dispatch: { inputs: Record<string, { options?: string[] }> } }).workflow_dispatch.inputs;
  expect(inputs.operation.options).toContain('put-worker-secrets');
});
it('gives put-bluesky-secrets only the deploy token, the account and admission identity, and the three Bluesky secrets', async () => {
  const workflow = await readWorkflow('deploy-iori-worker.yml');
  const job = workflow.jobs['put-bluesky-secrets'];
  const secret = (name: string) => `\${{ secrets.${name} }}`;
  expect(job.if).toBe('inputs.operation == \'put-bluesky-secrets\'');
  expect(job.needs).toBe('public-artifact-gate');
  expect(job.environment).toBe('${{ inputs.environment }}');
  expect(operation(job).env).toEqual({
    CLOUDFLARE_ACCOUNT_ID: secret('CLOUDFLARE_ACCOUNT_ID'),
    IORI_ADMISSION_IDENTITY: secret('IORI_ADMISSION_IDENTITY'),
    CLOUDFLARE_API_TOKEN: secret('IORI_CLOUDFLARE_DEPLOY_API_TOKEN'),
    BLUESKY_IDENTIFIER: secret('BLUESKY_IDENTIFIER'),
    BLUESKY_APP_PASSWORD: secret('BLUESKY_APP_PASSWORD'),
    BLUESKY_CREDENTIAL_KEY: secret('BLUESKY_CREDENTIAL_KEY'),
  });
  expect(Object.keys(operation(job).env!).filter(key => key.startsWith('BLUESKY_'))).toHaveLength(3);
  expect(JSON.stringify(job.steps.filter(step => step !== operation(job)))).not.toContain('secrets.');
  expect(JSON.stringify(job)).not.toMatch(/VAPID|SMOKE_QUEUE_TOKEN|TWITTERAPI_IO_API_KEY/);
  expect(JSON.stringify(job)).not.toMatch(/SSH|RECEIPT|R2|TERRAFORM|AWS_|STAGING_ACCESS_TOKEN|setup-terraform/);
  const inputs =
    (workflow.on as { workflow_dispatch: { inputs: Record<string, { options?: string[] }> } }).workflow_dispatch.inputs;
  expect(inputs.operation.options).toContain('put-bluesky-secrets');
});
it('rejects any environment other than production in the first step of put-bluesky-secrets', async () => {
  const workflow = await readWorkflow('deploy-iori-worker.yml');
  const lines = workflow.jobs['put-bluesky-secrets'].steps[0].run!.split('\n').map(line => line.trim());
  expect(lines).toContain('set -euo pipefail');
  expect(lines).toContain('test "$IORI_ENVIRONMENT" = production');
  expect(lines.indexOf('test "$IORI_ENVIRONMENT" = production')).toBeLessThan(
    lines.indexOf('test "$MAIN_SHA" = "$GITHUB_SHA"'),
  );
  expect(workflow.jobs['put-bluesky-secrets'].steps[0].run).toContain('refs/heads/main');
  const { spawnSync } = await import('node:child_process');
  const script = workflow.jobs['put-bluesky-secrets'].steps[0].run!;
  const sha = 'a'.repeat(40);
  const base = {
    GITHUB_ENV: '/dev/null',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: sha,
    MAIN_SHA: sha,
    IORI_OPERATION: 'put-bluesky-secrets',
  };
  const run = (environment: string) =>
    spawnSync('bash', ['-c', script], { env: { PATH: process.env.PATH, ...base, IORI_ENVIRONMENT: environment } });
  expect(run('production').status).toBe(0);
  expect(run('staging').status).not.toBe(0);
  expect(run('').status).not.toBe(0);
});
it('gives put-twitterapi-secret only the deploy token, the account and admission identity, and the twitterapi.io key', async () => {
  const workflow = await readWorkflow('deploy-iori-worker.yml');
  const job = workflow.jobs['put-twitterapi-secret'];
  const secret = (name: string) => `\${{ secrets.${name} }}`;
  expect(job.if).toBe('inputs.operation == \'put-twitterapi-secret\'');
  expect(job.needs).toBe('public-artifact-gate');
  expect(job.environment).toBe('${{ inputs.environment }}');
  expect(operation(job).env).toEqual({
    CLOUDFLARE_ACCOUNT_ID: secret('CLOUDFLARE_ACCOUNT_ID'),
    IORI_ADMISSION_IDENTITY: secret('IORI_ADMISSION_IDENTITY'),
    CLOUDFLARE_API_TOKEN: secret('IORI_CLOUDFLARE_DEPLOY_API_TOKEN'),
    TWITTERAPI_IO_API_KEY: secret('TWITTERAPI_IO_API_KEY'),
  });
  expect(Object.keys(operation(job).env!).filter(key => key.includes('TWITTERAPI'))).toHaveLength(1);
  expect(JSON.stringify(job.steps.filter(step => step !== operation(job)))).not.toContain('secrets.');
  expect(JSON.stringify(job)).not.toMatch(/VAPID|SMOKE_QUEUE_TOKEN|BLUESKY_/);
  expect(JSON.stringify(job)).not.toMatch(/SSH|RECEIPT|R2|TERRAFORM|AWS_|STAGING_ACCESS_TOKEN|setup-terraform/);
  const inputs =
    (workflow.on as { workflow_dispatch: { inputs: Record<string, { options?: string[] }> } }).workflow_dispatch.inputs;
  expect(inputs.operation.options).toContain('put-twitterapi-secret');
});
it('rejects any environment other than production in the first step of put-twitterapi-secret', async () => {
  const workflow = await readWorkflow('deploy-iori-worker.yml');
  const lines = workflow.jobs['put-twitterapi-secret'].steps[0].run!.split('\n').map(line => line.trim());
  expect(lines).toContain('set -euo pipefail');
  expect(lines).toContain('test "$IORI_ENVIRONMENT" = production');
  expect(lines.indexOf('test "$IORI_ENVIRONMENT" = production')).toBeLessThan(
    lines.indexOf('test "$MAIN_SHA" = "$GITHUB_SHA"'),
  );
  expect(workflow.jobs['put-twitterapi-secret'].steps[0].run).toContain('refs/heads/main');
  const { spawnSync } = await import('node:child_process');
  const script = workflow.jobs['put-twitterapi-secret'].steps[0].run!;
  const sha = 'a'.repeat(40);
  const base = {
    GITHUB_ENV: '/dev/null',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: sha,
    MAIN_SHA: sha,
    IORI_OPERATION: 'put-twitterapi-secret',
  };
  const run = (environment: string) =>
    spawnSync('bash', ['-c', script], { env: { PATH: process.env.PATH, ...base, IORI_ENVIRONMENT: environment } });
  expect(run('production').status).toBe(0);
  expect(run('staging').status).not.toBe(0);
  expect(run('').status).not.toBe(0);
});
it('gives delete-rehearsal-d1 only the account and the deploy token, and no input that names a database', async () => {
  const workflow = await readWorkflow('deploy-iori-worker.yml');
  const job = workflow.jobs['delete-rehearsal-d1'];
  const secret = (name: string) => `\${{ secrets.${name} }}`;
  expect(job.if).toBe('inputs.operation == \'delete-rehearsal-d1\'');
  expect(job.needs).toBe('public-artifact-gate');
  expect(job.environment).toBe('${{ inputs.environment }}');
  expect(operation(job).env).toEqual({
    CLOUDFLARE_ACCOUNT_ID: secret('CLOUDFLARE_ACCOUNT_ID'),
    CLOUDFLARE_API_TOKEN: secret('IORI_CLOUDFLARE_DEPLOY_API_TOKEN'),
  });
  expect(JSON.stringify(job.steps.filter(step => step !== operation(job)))).not.toContain('secrets.');
  expect(JSON.stringify(job)).not.toMatch(/SSH|RECEIPT|R2|TERRAFORM|AWS_|STAGING_ACCESS_TOKEN|setup-terraform|VAPID/);
  const inputs =
    (workflow.on as { workflow_dispatch: { inputs: Record<string, { options?: string[] }> } }).workflow_dispatch.inputs;
  expect(inputs.operation.options).toContain('delete-rehearsal-d1');
  expect(Object.keys(inputs)).toEqual([
    'main_sha',
    'migration_main_sha',
    'operation',
    'environment',
    'generation',
    'migration_run_id',
    'recovery',
    'repost_created_before_ms',
  ]);
});
it.each([
  'move-unfollowed-reposts-dry-run',
  'move-unfollowed-reposts',
  'delete-unfollowed-posts-dry-run',
  'delete-unfollowed-posts',
])(
  'gives %s only the account and the deploy token, and one optional input for the repost time limit',
  async (name) => {
    const workflow = await readWorkflow('deploy-iori-worker.yml');
    const job = workflow.jobs[name];
    const secret = (key: string) => `\${{ secrets.${key} }}`;
    expect(job.if).toBe(`inputs.operation == '${name}'`);
    expect(job.needs).toBe('public-artifact-gate');
    expect(job.environment).toBe('${{ inputs.environment }}');
    expect(operation(job).env).toEqual({
      CLOUDFLARE_ACCOUNT_ID: secret('CLOUDFLARE_ACCOUNT_ID'),
      CLOUDFLARE_API_TOKEN: secret('IORI_CLOUDFLARE_DEPLOY_API_TOKEN'),
    });
    expect(JSON.stringify(job.steps.filter(step => step !== operation(job)))).not.toContain('secrets.');
    expect(JSON.stringify(job)).not.toMatch(/SSH|RECEIPT|R2|TERRAFORM|AWS_|STAGING_ACCESS_TOKEN|setup-terraform|VAPID/);
    const text = await readFile(resolve(repositoryRoot, '.github/workflows/deploy-iori-worker.yml'), 'utf8');
    const parsed = parse(text) as {
      on: { workflow_dispatch: { inputs: Record<string, { required?: boolean; type?: string; options?: string[] }> } };
      env: Record<string, string>;
    };
    const inputs = parsed.on.workflow_dispatch.inputs;
    expect(inputs.operation.options).toContain(name);
    expect(inputs.repost_created_before_ms).toEqual({
      description: expect.any(String),
      required: false,
      type: 'string',
    });
    expect(parsed.env.IORI_REPOST_CREATED_BEFORE_MS).toBe('${{ inputs.repost_created_before_ms }}');
  },
);
it('gives domain-events-stats only the account and the deploy token, and no input beyond the generation', async () => {
  const workflow = await readWorkflow('deploy-iori-worker.yml');
  const job = workflow.jobs['domain-events-stats'];
  const secret = (key: string) => `\${{ secrets.${key} }}`;
  expect(job.if).toBe('inputs.operation == \'domain-events-stats\'');
  expect(job.needs).toBe('public-artifact-gate');
  expect(job.environment).toBe('${{ inputs.environment }}');
  expect(operation(job).env).toEqual({
    CLOUDFLARE_ACCOUNT_ID: secret('CLOUDFLARE_ACCOUNT_ID'),
    CLOUDFLARE_API_TOKEN: secret('IORI_CLOUDFLARE_DEPLOY_API_TOKEN'),
  });
  expect(JSON.stringify(job.steps.filter(step => step !== operation(job)))).not.toContain('secrets.');
  expect(JSON.stringify(job)).not.toMatch(/SSH|RECEIPT|R2|TERRAFORM|AWS_|STAGING_ACCESS_TOKEN|setup-terraform|VAPID/);
  const text = await readFile(resolve(repositoryRoot, '.github/workflows/deploy-iori-worker.yml'), 'utf8');
  const parsed = parse(text) as { on: { workflow_dispatch: { inputs: Record<string, { options?: string[] }> } } };
  expect(parsed.on.workflow_dispatch.inputs.operation.options).toContain('domain-events-stats');
});
it('gives digest-quality-sample only the account and the deploy token, and no input beyond the generation', async () => {
  const workflow = await readWorkflow('deploy-iori-worker.yml');
  const job = workflow.jobs['digest-quality-sample'];
  const secret = (key: string) => `\${{ secrets.${key} }}`;
  expect(job.if).toBe('inputs.operation == \'digest-quality-sample\'');
  expect(job.needs).toBe('public-artifact-gate');
  expect(job.environment).toBe('${{ inputs.environment }}');
  expect(operation(job).env).toEqual({
    CLOUDFLARE_ACCOUNT_ID: secret('CLOUDFLARE_ACCOUNT_ID'),
    CLOUDFLARE_API_TOKEN: secret('IORI_CLOUDFLARE_DEPLOY_API_TOKEN'),
  });
  expect(JSON.stringify(job.steps.filter(step => step !== operation(job)))).not.toContain('secrets.');
  expect(JSON.stringify(job)).not.toMatch(/SSH|RECEIPT|R2|TERRAFORM|AWS_|STAGING_ACCESS_TOKEN|setup-terraform|VAPID/);
  const text = await readFile(resolve(repositoryRoot, '.github/workflows/deploy-iori-worker.yml'), 'utf8');
  const parsed = parse(text) as { on: { workflow_dispatch: { inputs: Record<string, { options?: string[] }> } } };
  expect(parsed.on.workflow_dispatch.inputs.operation.options).toContain('digest-quality-sample');
});
it.each(['delete-blocked-domain-posts-dry-run', 'delete-blocked-domain-posts'])(
  'gives %s only the account and the deploy token, and no input for the target domain',
  async (name) => {
    const workflow = await readWorkflow('deploy-iori-worker.yml');
    const job = workflow.jobs[name];
    const secret = (key: string) => `\${{ secrets.${key} }}`;
    expect(job.if).toBe(`inputs.operation == '${name}'`);
    expect(job.needs).toBe('public-artifact-gate');
    expect(job.environment).toBe('${{ inputs.environment }}');
    expect(operation(job).env).toEqual({
      CLOUDFLARE_ACCOUNT_ID: secret('CLOUDFLARE_ACCOUNT_ID'),
      CLOUDFLARE_API_TOKEN: secret('IORI_CLOUDFLARE_DEPLOY_API_TOKEN'),
    });
    expect(JSON.stringify(job.steps.filter(step => step !== operation(job)))).not.toContain('secrets.');
    expect(JSON.stringify(job)).not.toMatch(/SSH|RECEIPT|R2|TERRAFORM|AWS_|STAGING_ACCESS_TOKEN|setup-terraform|VAPID/);
    const parsed = parse(
      await readFile(resolve(repositoryRoot, '.github/workflows/deploy-iori-worker.yml'), 'utf8'),
    ) as {
      on: { workflow_dispatch: { inputs: Record<string, { options?: string[] }> } };
    };
    expect(parsed.on.workflow_dispatch.inputs.operation.options).toContain(name);
    expect(Object.keys(parsed.on.workflow_dispatch.inputs)).not.toContain('domain');
  },
);
it('gives prune-federated-posts-dry-run only the account and the deploy token, and no extra input', async () => {
  const name = 'prune-federated-posts-dry-run';
  const workflow = await readWorkflow('deploy-iori-worker.yml');
  const job = workflow.jobs[name];
  const secret = (key: string) => `\${{ secrets.${key} }}`;
  expect(job.if).toBe(`inputs.operation == '${name}'`);
  expect(job.needs).toBe('public-artifact-gate');
  expect(job.environment).toBe('${{ inputs.environment }}');
  expect(operation(job).env).toEqual({
    CLOUDFLARE_ACCOUNT_ID: secret('CLOUDFLARE_ACCOUNT_ID'),
    CLOUDFLARE_API_TOKEN: secret('IORI_CLOUDFLARE_DEPLOY_API_TOKEN'),
  });
  expect(JSON.stringify(job.steps.filter(step => step !== operation(job)))).not.toContain('secrets.');
  expect(JSON.stringify(job)).not.toMatch(/SSH|RECEIPT|R2|TERRAFORM|AWS_|STAGING_ACCESS_TOKEN|setup-terraform|VAPID/);
  expect(JSON.stringify(job)).not.toMatch(/IORI_REPOST_CREATED_BEFORE_MS|repost_created_before_ms/);
  const text = await readFile(resolve(repositoryRoot, '.github/workflows/deploy-iori-worker.yml'), 'utf8');
  const parsed = parse(text) as {
    on: { workflow_dispatch: { inputs: Record<string, { options?: string[] }> } };
  };
  const options = parsed.on.workflow_dispatch.inputs.operation.options!;
  expect(options).toContain(name);
  expect(options.filter(option => option.startsWith('prune-federated-posts'))).toEqual([name]);
});
it('gives ensure-event-archive-bucket only the account and the deploy token, and no extra input', async () => {
  const name = 'ensure-event-archive-bucket';
  const workflow = await readWorkflow('deploy-iori-worker.yml');
  const job = workflow.jobs[name];
  const secret = (key: string) => `\${{ secrets.${key} }}`;
  expect(job.if).toBe(`inputs.operation == '${name}'`);
  expect(job.needs).toBe('public-artifact-gate');
  expect(job.environment).toBe('${{ inputs.environment }}');
  expect(operation(job).env).toEqual({
    CLOUDFLARE_ACCOUNT_ID: secret('CLOUDFLARE_ACCOUNT_ID'),
    CLOUDFLARE_API_TOKEN: secret('IORI_CLOUDFLARE_DEPLOY_API_TOKEN'),
  });
  expect(JSON.stringify(job.steps.filter(step => step !== operation(job)))).not.toContain('secrets.');
  expect(JSON.stringify(job)).not.toMatch(/SSH|RECEIPT|TERRAFORM|AWS_|STAGING_ACCESS_TOKEN|setup-terraform|VAPID/);
  expect(JSON.stringify(job)).not.toMatch(/IORI_REPOST_CREATED_BEFORE_MS|repost_created_before_ms/);
  const text = await readFile(resolve(repositoryRoot, '.github/workflows/deploy-iori-worker.yml'), 'utf8');
  const parsed = parse(text) as {
    on: { workflow_dispatch: { inputs: Record<string, { options?: string[] }> } };
  };
  const options = parsed.on.workflow_dispatch.inputs.operation.options!;
  expect(options.filter(option => option === name)).toEqual([name]);
});
it('lets diagnose-source start without generation or run ID', async () => {
  const workflow = await readWorkflow('deploy-iori-worker.yml');
  const inputs =
    (workflow.on as { workflow_dispatch: { inputs: Record<string, { required: boolean; options?: string[] }> } })
      .workflow_dispatch.inputs;
  expect(inputs.operation.options).toEqual(expect.arrayContaining(['diagnose-source']));
  expect(inputs.generation.required).toBe(false);
  expect(inputs.migration_run_id.required).toBe(false);
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
it('deploys the Worker on a main push through a fixed deploy-worker job holding the deploy token and no Terraform or transfer storage credential', async () => {
  const [worker, source, main] = await Promise.all([
    readWorkflow('deploy-iori-worker.yml'),
    readWorkflow('deploy-iori.yml'),
    readWorkflow('deploy-iori-worker-main.yml'),
  ]);
  expect(main.on).toEqual({
    push: {
      branches: ['main'],
      paths: [
        'apps/iori/src/**',
        '!apps/iori/src/**/*.test.ts',
        '!apps/iori/src/**/*.test.tsx',
        '!apps/iori/src/**/__tests__/**',
        '!apps/iori/src/testing/**',
        'apps/iori/public/**',
        'apps/iori/drizzle-d1/**',
        'apps/iori/workers/iori/wrangler.template.jsonc',
        'apps/iori/infra/cloudflare/*.tf',
        'apps/iori/infra/cloudflare/.terraform.lock.hcl',
        'apps/iori/scripts/**',
        '!apps/iori/scripts/__tests__/**',
        '!apps/iori/scripts/**/*.d.mts',
        'apps/iori/package.json',
        'apps/iori/tsconfig.json',
        'apps/iori/vite.config.js',
        'packages/result/src/**',
        '!packages/result/src/**/*.test.ts',
        'packages/result/package.json',
        'packages/result/tsconfig.json',
        'packages/result/tsconfig.build.json',
        'package.json',
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
        '.github/workflows/deploy-iori-worker-main.yml',
      ],
    },
  });
  const pushPaths = (main.on as { push: { paths: string[] } }).push.paths;
  const toRegExp = (glob: string) =>
    new RegExp(
      `^${
        glob.replace(
          /\*\*\/|\*\*|\*|[.+?^${}()|[\]\\]/g,
          (token) => token === '**/' ? '(?:.*/)?' : token === '**' ? '.*' : token === '*' ? '[^/]*' : `\\${token}`,
        )
      }$`,
    );
  const triggersDeploy = (path: string) =>
    pushPaths.reduce(
      (matched, pattern) =>
        pattern.startsWith('!')
          ? matched && !toRegExp(pattern.slice(1)).test(path)
          : matched || toRegExp(pattern).test(path),
      false,
    );
  for (
    const path of [
      'apps/iori/src/worker.ts',
      'apps/iori/src/ui/pages/home.tsx',
      'apps/iori/drizzle-d1/0000_boring_xavin.sql',
      'apps/iori/drizzle-d1/meta/_journal.json',
      'apps/iori/public/sw.js',
      'apps/iori/scripts/temporary-worker-config.mjs',
      'apps/iori/workers/iori/wrangler.template.jsonc',
      'apps/iori/infra/cloudflare/main.tf',
      'apps/iori/package.json',
      'packages/result/src/result/result.ts',
      'pnpm-lock.yaml',
      '.github/workflows/deploy-iori-worker-main.yml',
    ]
  ) expect(triggersDeploy(path), path).toBe(true);
  for (
    const path of [
      'apps/iori/README.md',
      'apps/iori/docs/execution-guide.md',
      'apps/iori/src/worker.test.ts',
      'apps/iori/src/ui/components/Button.test.tsx',
      'apps/iori/src/useCase/__tests__/helper/mockAdaptors.ts',
      'apps/iori/src/testing/admissionFixture.ts',
      'apps/iori/scripts/__tests__/cloudflareWorkflowGuards.test.ts',
      'apps/iori/scripts/hosted-workflow.d.mts',
      'apps/iori/workerd-tests/worker.test.ts',
      'apps/iori/workers/iori/wrangler.local.jsonc',
      'apps/iori/drizzle/0000_modern_anita_blake.sql',
      'packages/result/src/result/result.test.ts',
      'packages/result/README.md',
      'packages/kosui-ui/package.json',
    ]
  ) expect(triggersDeploy(path), path).toBe(false);
  expect(main.concurrency).toEqual({ group: 'deploy-iori-worker-production', 'cancel-in-progress': false });
  expect(main.concurrency.group).toBe(worker.concurrency.group);
  expect(main.env).toMatchObject({
    MAIN_SHA: '${{ github.sha }}',
    IORI_OPERATION: 'deploy-worker',
    IORI_ENVIRONMENT: 'production',
  });
  expect(Object.keys(main.jobs)).toEqual(['public-artifact-gate', 'deploy-worker']);
  for (const job of Object.values(main.jobs)) {
    expect(job.steps[0].run).toContain('test "$GITHUB_EVENT_NAME" = push');
    expect(job.steps[0].run).toContain('test "$GITHUB_REF" = refs/heads/main');
    expect(job.steps[0].run).not.toContain('workflow_dispatch');
    expect(job.steps.at(-1)?.if).toBe('always() && env.IORI_PRIVATE_DIRECTORY != \'\'');
  }
  const job = main.jobs['deploy-worker'];
  expect(job.environment).toBe('production');
  expect(job.needs).toBe('public-artifact-gate');
  expect(job.if).toBeUndefined();
  expect(job.steps.some(step => step.uses?.startsWith('hashicorp/setup-terraform'))).toBe(false);
  const deploy = operation(job).env!;
  expect(deploy).toEqual(operation(worker.jobs['deploy-worker']).env);
  expect(Object.keys(deploy)).toEqual([
    'IORI_ADMISSION_MODE',
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_ZONE_ID',
    'IORI_ADMISSION_IDENTITY',
    'ORIGIN',
    'VAPID_SUBJECT',
    'CLOUDFLARE_API_TOKEN',
  ]);
  expect(deploy.CLOUDFLARE_API_TOKEN).toBe('${{ secrets.IORI_CLOUDFLARE_DEPLOY_API_TOKEN }}');
  expect(JSON.stringify(main)).not.toMatch(
    /SSH|RECEIPT|WRITE|SMOKE_QUEUE_TOKEN|IORI_MIGRATION_REHEARSAL|VAPID_(?:PUBLIC|PRIVATE)|STAGING_ACCESS_TOKEN|MIGRATE_API_TOKEN|CUTOVER_API_TOKEN|inputs\.|workflow_dispatch/,
  );
  expect(JSON.stringify(main.jobs['public-artifact-gate'])).not.toContain('secrets.');
  const comparable = (steps: Step[]) =>
    steps.map(({ name, uses, with: inputs, run, env }) => ({ name, uses, with: inputs, run, env }));
  for (const name of ['public-artifact-gate', 'deploy-worker']) {
    const [pushFirst, ...pushRest] = comparable(main.jobs[name].steps);
    const [dispatchFirst, ...dispatchRest] = comparable(worker.jobs[name].steps);
    expect(pushRest).toEqual(dispatchRest);
    expect(pushFirst.name).toBe(dispatchFirst.name);
    expect(pushFirst.run).toBe(dispatchFirst.run!.replace('= workflow_dispatch', '= push'));
  }
  expect(source.on).toEqual({ workflow_dispatch: null });
  expect(source.jobs['build-and-deploy'].steps[0].run).toContain('test "$GITHUB_EVENT_NAME" = workflow_dispatch');
  expect(source.jobs['build-and-deploy'].steps[0].run).not.toContain('= push');
});
it('keeps restarting the source unit longer than the deployment status wait', async () => {
  const unit = await readFile(resolve(repositoryRoot, 'apps/iori/microblog.service'), 'utf8');
  const sections = new Map<string, string>();
  let section = '';
  for (const line of unit.split('\n')) {
    const header = /^\[(\w+)\]$/.exec(line);
    if (header) section = header[1];
    else if (line.trim() !== '') sections.set(section, `${sections.get(section) ?? ''}${line}\n`);
  }
  expect(sections.get('Unit')).toMatch(/^StartLimitIntervalSec\s*=\s*180$/m);
  expect(sections.get('Unit')).toMatch(/^StartLimitBurst\s*=\s*30$/m);
  expect(sections.get('Service')).toMatch(/^RestartSec\s*=\s*5s$/m);
  expect(sections.get('Service')).toMatch(/^Restart\s*=\s*always$/m);
  expect(sections.get('Service')).not.toMatch(/StartLimit/);
  expect(sections.get('Unit')).not.toMatch(/RestartSec/);
});
it('wires the test step, Terraform setup and sealed CI identity', async () => {
  const ci = await readWorkflow('ci.yml');
  const steps = ci.jobs.iori.steps;
  expect(steps.find(step => step.name === 'Test')?.run).toBe(
    'pnpm --filter iori run test:ci --maxWorkers=1 --no-file-parallelism',
  );
  expect(
    ci.jobs['iori-terraform'].steps.find(step => step.uses?.startsWith('hashicorp/setup-terraform'))?.with
      ?.terraform_wrapper,
  ).toBe(false);
  const guard = steps.find(step => step.name === 'Run guarded Cloudflare checks')!.run!;
  expect(guard).toContain('IORI_ADMISSION_MODE=sealed');
  expect(guard).toContain('iori-staging-fixture1');
  expect(guard).toContain('IORI_ADMISSION_IDENTITY=');
  expect(guard).toContain('assert-workflow-output.mjs');
});
it('runs readonly Terraform init and validate in CI', async () => {
  const ci = await readWorkflow('ci.yml');
  const steps = ci.jobs['iori-terraform'].steps;
  const lines = steps.find(step => step.name === 'Run guarded Terraform checks')!.run!
    .split('\n').map(line => line.trim());
  const init = lines.indexOf(
    'node apps/iori/scripts/run-guarded-retry.mjs terraform -chdir=apps/iori/infra/cloudflare init -backend=false -input=false -lockfile=readonly',
  );
  expect(init).toBeGreaterThan(-1);
  expect(lines[init + 1]).toBe('run_guarded terraform -chdir=apps/iori/infra/cloudflare validate');
  expect(lines.filter(line => line.includes('run-guarded-retry.mjs'))).toHaveLength(1);
  expect(lines.filter(line => /^run_guarded\b.*\binit\b/.test(line))).toEqual([]);
  expect(lines.some(line => line.includes('git diff --exit-code'))).toBe(false);
});
it('runs Terraform checks in a job independent of the apps/iori build and test', async () => {
  const ci = await readWorkflow('ci.yml');
  const terraform = ci.jobs['iori-terraform'];
  expect(JSON.stringify(ci.jobs.iori)).not.toMatch(/terraform/i);
  expect(ci.jobs.iori.needs).toBeUndefined();
  expect(terraform.needs).toBeUndefined();
  expect(terraform).not.toHaveProperty('continue-on-error');
});
it('uses the same run_guarded definition in both guarded check steps', async () => {
  const ci = await readWorkflow('ci.yml');
  const definition = (job: Job, stepName: string) => {
    const lines = job.steps.find(step => step.name === stepName)!.run!.split('\n');
    const start = lines.findIndex(line => line.trim() === 'run_guarded() {');
    const end = lines.findIndex((line, index) => index > start && line.trim() === '}');
    return lines.slice(start, end + 1).join('\n');
  };
  const cloudflare = definition(ci.jobs.iori, 'Run guarded Cloudflare checks');
  expect(cloudflare).toContain('run_guarded() {');
  expect(definition(ci.jobs['iori-terraform'], 'Run guarded Terraform checks')).toBe(cloudflare);
});
it('prints one fixed failure line to stderr without the command output when a guarded command fails', async () => {
  const { spawnSync } = await import('node:child_process');
  const ci = await readWorkflow('ci.yml');
  const script = ci.jobs.iori.steps.find(step => step.name === 'Run guarded Cloudflare checks')!.run!;
  const lines = script.split('\n');
  const start = lines.findIndex(line => line.trim() === 'run_guarded() {');
  const end = lines.findIndex((line, index) => index > start && line.trim() === '}');
  const definition = lines.slice(start, end + 1).join('\n');
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
  const ci = await readWorkflow('ci.yml');
  const script = ci.jobs.iori.steps.find(step => step.name === 'Run guarded Cloudflare checks')!.run!;
  const lines = script.split('\n');
  const start = lines.findIndex(line => line.trim() === 'run_guarded() {');
  const end = lines.findIndex((line, index) => index > start && line.trim() === '}');
  const definition = lines.slice(start, end + 1).join('\n');
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
it('cancels superseded deploy runs from a workflow outside the production lock', async () => {
  const main = await readWorkflow('deploy-iori-worker-main.yml');
  const cancel = await readWorkflow('cancel-superseded-iori-deploys.yml');
  expect((cancel.on as { push: unknown }).push).toEqual((main.on as { push: unknown }).push);
  expect(cancel.concurrency).toBeUndefined();
  expect((cancel as Workflow & { permissions?: unknown }).permissions).toEqual({
    actions: 'write',
    contents: 'read',
  });
  const job = cancel.jobs['cancel-superseded-deploys'];
  expect(job.environment).toBeUndefined();
  expect(job.steps.at(-1)?.run).toBe('node apps/iori/scripts/cancel-superseded-deploys.mjs');
  expect(main.jobs['deploy-worker']).not.toHaveProperty('name');
});
