import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(process.cwd(), '..', '..');
const readWorkflow = (name: string) => readFile(resolve(repositoryRoot, '.github/workflows', name), 'utf8');

describe('Cloudflare workflow public-artifact gates', () => {
  it('keeps the CI Cloudflare checks behind the public-artifact guard and writes a redacted summary', async () => {
    const workflow = await readWorkflow('ci.yml');

    expect(workflow).toContain('run_guarded pnpm --silent --filter iori run cloudflare:public-artifacts:check');
    expect(workflow).toContain('Write redacted Cloudflare validation summary');
    expect(workflow).toContain('GITHUB_STEP_SUMMARY');
  });

  it('requires every protected deploy operation to pass one public-artifact gate with a redacted summary', async () => {
    const workflow = await readWorkflow('deploy-iori-worker.yml');

    expect(workflow).toContain('public-artifact-gate:');
    expect(workflow).toContain('Verify public artifacts and write redacted summary');
    expect(workflow).toContain('pnpm --silent --filter iori run cloudflare:public-artifacts:check');
    expect(workflow.match(/needs: public-artifact-gate/g)).toHaveLength(6);
    expect(workflow).toContain('needs: [public-artifact-gate, verify-import, workers-dev-validation]');
    expect(workflow).toContain('## Terraform action summary');
    expect(workflow).toContain('assert-workflow-output.mjs <"$action_summary"');
    expect(workflow).toContain('cat "$action_summary" >> "$GITHUB_STEP_SUMMARY"');
    expect(workflow.match(/TF_VAR_public_hostname: \$\{\{ secrets\.IORI_PUBLIC_HOSTNAME \}\}/g)).toHaveLength(4);
    expect(workflow).toContain('TF_VAR_enable_production_worker_route: "true"');
    expect(workflow).toContain('production_route:');
    expect(workflow).toContain('default: absent');
    expect(workflow).toContain('TF_VAR_enable_production_worker_route: ${{ inputs.production_route == \'present\' }}');
    expect(workflow).toContain('workers-dev-validation:');
    expect(workflow).toContain('Run protected post-cutover smoke');
    expect(workflow).toContain('migrate-data:');
    expect(workflow).toContain('if: inputs.operation == \'migrate-data\'');
    expect(workflow).toContain('cloudflare:migrate:protected');
    expect(workflow).toContain('IORI_MIGRATION_CONTRACT: ${{ secrets.IORI_MIGRATION_CONTRACT_PATH }}');
    expect(workflow).toContain('migration_run_id:');
    expect(workflow).toContain('IORI_MIGRATION_RUN_ID: ${{ inputs.migration_run_id }}');
    expect(workflow).toContain(
      'IORI_MIGRATION_RECEIPT_PUBLIC_KEY_SHA256: ${{ secrets.IORI_MIGRATION_RECEIPT_PUBLIC_KEY_SHA256 }}',
    );
    expect(workflow).toContain('IORI_IMPORT_RUNNER_SHA256: ${{ secrets.IORI_IMPORT_RUNNER_SHA256 }}');
    expect(workflow).toContain('Validate protected mounted migration contract');
    expect(workflow).toContain('validate-private-mounted-inputs.mjs --require-contract');
    expect(workflow).toContain('pnpm --silent --filter iori run cloudflare:migrate:protected >"$output" 2>&1');
    expect(workflow.match(/run-cloudflare-smoke\.mjs/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('silences every pnpm command whose output is captured for scanning', async () => {
    const workflow = await readWorkflow('deploy-iori-worker.yml');
    const capturedPnpmCommands = workflow.match(/^\s*pnpm .*?>"\$output" 2>&1.*$/gm) ?? [];

    expect(capturedPnpmCommands).toHaveLength(4);
    expect(capturedPnpmCommands.every((command) => command.includes('pnpm --silent '))).toBe(true);
  });

  it('materializes protected verification inputs and Terraform-derived Worker bindings on the runner', async () => {
    const workflow = await readWorkflow('deploy-iori-worker.yml');

    expect(workflow).toContain('runs-on: [self-hosted, iori-production-migration]');
    expect(workflow).toContain('IORI_EXPORT_MANIFEST: ${{ secrets.IORI_EXPORT_MANIFEST_PATH }}');
    expect(workflow).toContain('IORI_IMPORT_RUNNER: ${{ secrets.IORI_IMPORT_RUNNER_PATH }}');
    expect(workflow).not.toContain('IORI_EXPORT_DATA_FILES_JSON');
    expect(workflow).not.toContain('IORI_IMPORT_RUNNER_SOURCE');
    expect(workflow).toContain('IORI_WORKER_BINDINGS_PATH');
    expect(workflow).toContain('terraform -chdir=apps/iori/infra/cloudflare output -json worker_bindings');
    expect(workflow).toContain('materialize-worker-bindings.mjs');
    expect(workflow).not.toContain('D1_DATABASE_ID: ${{ secrets.IORI_D1_DATABASE_ID }}');
    expect(workflow).not.toContain('KV_NAMESPACE_ID: ${{ secrets.IORI_KV_NAMESPACE_ID }}');
    expect(workflow).not.toContain('R2_BUCKET_NAME: ${{ secrets.IORI_R2_BUCKET_NAME }}');
    expect(workflow).not.toContain('QUEUE_NAME: ${{ secrets.IORI_QUEUE_NAME }}');
    expect(workflow).toContain('SMOKE_QUEUE_TOKEN: ${{ secrets.IORI_SMOKE_QUEUE_TOKEN }}');
    expect(workflow).toContain('IORI_SMOKE_CHECKS_JSON: ${{ secrets.IORI_SMOKE_CHECKS_JSON }}');
    expect(workflow).toContain('IORI_SMOKE_ALLOWED_HOSTNAME: ${{ secrets.IORI_SMOKE_ALLOWED_HOSTNAME }}');
    expect(workflow).toContain('IORI_SMOKE_QUEUE_TOKEN: ${{ secrets.IORI_SMOKE_QUEUE_TOKEN }}');
    expect(workflow).toContain('Reject changed Terraform bindings before Worker deployment');
    expect(workflow).toContain('--require-worker-bindings-no-op');
    expect(workflow).toContain('cleanup-private-workflow-directory.mjs');
    expect(workflow).not.toContain('rm -rf -- "$TMPDIR"');
    expect(workflow).toContain('if: always() && env.IORI_QUEUE_PRODUCER_REMOVED == \'true\'');
    expect(workflow).toContain('\'IORI_QUEUE_PRODUCER_REMOVED=true\' >> "$GITHUB_ENV"');
  });

  it('protects all durable Terraform resources and retains the production route during reconcile', async () => {
    const terraform = await readFile(resolve(repositoryRoot, 'apps/iori/infra/cloudflare/main.tf'), 'utf8');

    expect(terraform.match(/prevent_destroy = true/g)).toHaveLength(6);
    expect(terraform).toContain('resource "cloudflare_workers_route" "iori"');
  });

  it('documents the protected Terraform hostname input', async () => {
    const [migration, runbook] = await Promise.all([
      readFile(resolve(repositoryRoot, 'apps/iori/docs/operations/cloudflare-migration.md'), 'utf8'),
      readFile(resolve(repositoryRoot, 'apps/iori/docs/operations/cloudflare-cutover-runbook.md'), 'utf8'),
    ]);

    expect(migration).toContain('TF_VAR_public_hostname');
    expect(runbook).toContain('TF_VAR_public_hostname');
  });
});
