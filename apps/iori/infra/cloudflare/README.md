# iori Cloudflare Terraform

Terraform owns D1, the application and private transfer R2 buckets, Fedify KV, Queues, the Queue consumer, and the opt-in Worker route. Wrangler owns Worker versions, bindings, Assets, observability, secrets, and D1 migrations. Do not put Worker versions, deployments, bindings or secret values in Terraform state.

Use the protected hosted workflow described in the [cutover runbook](../../docs/operations/cloudflare-cutover-runbook.md). Creating a Draft PR does not provision resources or authorize a production cutover.

Start with the [operator execution guide](../../docs/operations/cloudflare-execution-guide.md) for the observed readiness state, authentication, Environment protection, credential setup, source diagnostics, initial rehearsal prerequisites, and one-operation-at-a-time workflow commands.

## Fresh generation and backend

Each migration uses a new `environment` (`staging` or `production`) and `generation` (8–20 lowercase alphanumeric characters, starting with a letter). Resource and Worker names derive from `iori-<environment>-<generation>`. The state key is:

```text
iori/<environment>/<generation>/terraform.tfstate
```

The backend bucket is separately bootstrapped and must differ from both application and transfer buckets. Preserve previous resources and state keys. Do not move an old state, attach fresh bindings to an old Worker, or reuse a partially prepared generation. Terraform workspaces are not used.

The protected preparation operation verifies an empty new backend and absent target names, creates storage and delivery-paused Queues without a consumer, deploys the first sealed Worker version, then attaches the paused consumer. It verifies real IDs, associations, Worker version, bindings, disabled previews and absent route. Only a successful preparation may publish its bounded record to the fixed key in the private transfer bucket. Uncertain writes or failed readback stop the operation and retain the generation for explicit recovery.

Later jobs initialize the explicitly selected established backend in a new private directory and read its outputs. They do not run the fresh creation checks or import existing resources. The legacy `import-existing-resources.mjs` is not part of this migration path.

## Protected inputs and outputs

The workflow supplies account, zone, environment, generation, reviewed hostname and backend connection settings. The Worker name is derived from the generation. `attach_queue_consumer` defaults to false and `queue_delivery_paused` defaults to true. The protected orchestration controls their transitions; the route remains absent until verification and smoke succeed. Queue delivery resumes last.

Keep backend configuration, `TF_DATA_DIR`, state/output/plan files, generated Wrangler configuration and diagnostics under each job's new mode `0700` private root. Files use mode `0600`. Do not print them or send them to GitHub artifacts, caches, outputs or summaries. Disable the `setup-terraform` wrapper in protected jobs so raw command output is not copied into GitHub step outputs.

The sensitive outputs are:

| Output              | Use                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| `worker_bindings`   | Exact D1/KV IDs, application R2 and Queue names, derived Worker name                            |
| `migration_storage` | Private transfer bucket and environment                                                         |
| `target_identity`   | Account, environment, generation, backend key, Queue/DLQ IDs, settings and consumer association |

Read all three together into a private file and correlate them with the independently supplied invocation/backend identity. After consumer creation, use the final outputs. A signed bundle does not replace this independent expected target. The prepared sealed Worker version is immutable evidence; later smoke/activation versions are verified separately.

The transfer bucket has no managed public domain, custom domain or application binding. Transfer credentials are separate from state and application-data credentials. The receipt signing key belongs only to the migration executor; preparation and verification do not need it.

## Environment references

Configure the separately protected `production` and `staging` Environments before dispatch. The current workflow reads these common secret references: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`, `IORI_TERRAFORM_BACKEND_BUCKET`, `IORI_ADMISSION_IDENTITY`, `ORIGIN`, and `VAPID_SUBJECT`. These are reference names, not a claim that values or protection rules have been configured.

Dispatch supplies `main_sha`, `operation`, `environment`, `generation`, and `migration_run_id`. For a later normal Worker update, `migration_main_sha` supplies the original admission SHA while `main_sha` selects current reviewed code. Preserve the original admission JSON, generation and run identity. A new migration generation requires matching newly selected identity inputs.

Each credential prefix below denotes its `_ACCESS_KEY_ID` and `_SECRET_ACCESS_KEY` pair. The workflow maps the state pair to `AWS_*`, transfer pair to `IORI_MIGRATION_R2_*`, application pair to `IORI_APPLICATION_R2_*`, and the role API token to `CLOUDFLARE_API_TOKEN` only in the operation step.

| Operation        | Cloudflare API token reference      | State prefix               | Transfer prefix              | Application prefix              |
| ---------------- | ----------------------------------- | -------------------------- | ---------------------------- | ------------------------------- |
| `prepare-target` | `IORI_CLOUDFLARE_PREPARE_API_TOKEN` | `IORI_TERRAFORM_WRITE`     | `IORI_TRANSFER_R2_WRITE`     | —                               |
| `migrate-data`   | `IORI_CLOUDFLARE_MIGRATE_API_TOKEN` | `IORI_TERRAFORM_READ_ONLY` | `IORI_TRANSFER_R2_WRITE`     | `IORI_APPLICATION_R2_WRITE`     |
| `verify-import`  | `IORI_CLOUDFLARE_VERIFY_API_TOKEN`  | `IORI_TERRAFORM_READ_ONLY` | `IORI_TRANSFER_R2_READ_ONLY` | `IORI_APPLICATION_R2_READ_ONLY` |
| `cutover-route`  | `IORI_CLOUDFLARE_CUTOVER_API_TOKEN` | `IORI_TERRAFORM_WRITE`     | `IORI_TRANSFER_R2_READ_ONLY` | `IORI_APPLICATION_R2_READ_ONLY` |
| `deploy-worker`  | `IORI_CLOUDFLARE_DEPLOY_API_TOKEN`  | `IORI_TERRAFORM_READ_ONLY` | `IORI_TRANSFER_R2_READ_ONLY` | —                               |

Preparation additionally uses `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SMOKE_QUEUE_TOKEN`, and the distinct staging-only `STAGING_ACCESS_TOKEN`. Cutover maps the same `SMOKE_QUEUE_TOKEN` to `IORI_SMOKE_QUEUE_TOKEN` for every smoke request.

Migrate, verify and cutover receive `IORI_MIGRATION_RECEIPT_PUBLIC_KEY` and `IORI_MIGRATION_RECEIPT_PUBLIC_KEY_SHA256`. Only migrate receives `IORI_MIGRATION_RECEIPT_PRIVATE_KEY` and the measured JSON profile `IORI_MIGRATION_REHEARSAL`. Key/profile values become exclusive mode `0600` job-local files; Environment values are not persistent filesystem paths.

Migrate, cutover and source prerequisite deployment use `IORI_SOURCE_SSH_HOST`, `IORI_SOURCE_SSH_USER`, `IORI_SOURCE_SSH_PRIVATE_KEY`, and `IORI_SOURCE_SSH_KNOWN_HOSTS`. The key and pinned known-hosts values become private files. Do not bootstrap trust with `ssh-keyscan`, supply source database credentials to the runner, or recreate source `env.conf` during this deployment.

The source deployment workflow retains its matching-path `main` push trigger as well as manual dispatch. Configure required reviewers and the main branch restriction before supplying source credentials and merging: the Environment name alone does not enforce approval, and a merge can start this protected job. Worker migration operations remain manual dispatches.

The API scopes must match the fixed operation, including the actual readback APIs. Normal Worker deploy may update the existing producer Queue through Wrangler; it must preserve the full verified Queue/consumer/route configuration. It has no state-apply, signing, source-control, or application-import step. See the [cutover runbook](../../docs/operations/cloudflare-cutover-runbook.md) for the capability and recovery boundaries.

## Local validation

These commands validate the checked-in module without connecting to the backend or Cloudflare:

```sh
terraform fmt -check -recursive
terraform init -backend=false -input=false
terraform validate
```

Use the pinned provider and lockfile. Real plans are captured privately and validated for the specific operation before applying the same saved plan. Public output contains only sanitized status and action counts. See the [migration design](../../../../docs/superpowers/specs/2026-08-16-iori-cloudflare-complete-migration-design.md) for ownership and acceptance conditions.
