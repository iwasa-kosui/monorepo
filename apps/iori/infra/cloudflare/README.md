# iori Cloudflare Terraform

Terraform owns D1, the application, private transfer and private event archive R2 buckets, Fedify KV, Queues, the Queue consumer, and the opt-in Worker route. Wrangler owns Worker versions, bindings, Assets, observability, secrets, and D1 migrations. Do not put Worker versions, deployments, bindings or secret values in Terraform state.

This Terraform stays in place until the old environment is shut down. After that, the plan is to manage these resources with Wrangler alone.

Use the protected hosted workflow for Worker updates. The [operator execution guide](../../docs/operations/cloudflare-execution-guide.md) covers authentication, Environment protection, credential setup, source diagnostics, and one-operation-at-a-time workflow commands. The [cutover runbook](../../docs/operations/cloudflare-cutover-runbook.md) covers rollback to the old environment, retention, and operating signals. Creating a Draft PR does not provision resources.

## Protected inputs and outputs

Terraform runs only in the CI validate steps (`terraform fmt`, `terraform init -backend=false` and `terraform validate` in `.github/workflows/ci.yml`). The protected workflows do not run Terraform. The workflow supplies account, zone, environment, generation and reviewed hostname to the Worker operations. The Worker name is derived from the generation. `attach_queue_consumer` defaults to false and `queue_delivery_paused` defaults to true.

Keep generated Wrangler configuration and diagnostics under each job's new mode `0700` private root. Files use mode `0600`. Do not print them or send them to GitHub artifacts, caches, outputs or summaries.

## Environment references

Configure the separately protected `production` and `staging` Environments before dispatch. The current workflow reads these common secret references: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`, `IORI_ADMISSION_IDENTITY`, `ORIGIN`, and `VAPID_SUBJECT`. These are reference names, not a claim that values or protection rules have been configured.

Dispatch supplies `main_sha`, `operation`, `environment`, `generation`, and `migration_run_id`. For a normal Worker update, `migration_main_sha` supplies the original admission SHA while `main_sha` selects current reviewed code. Preserve the original admission JSON, generation and run identity.

`deploy-worker` and `put-worker-secrets` use the Cloudflare API token reference `IORI_CLOUDFLARE_DEPLOY_API_TOKEN`. The workflow maps it to `CLOUDFLARE_API_TOKEN` only in the operation step. Neither operation receives a state, transfer or application S3 credential.

`deploy-worker` receives only six secrets: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`, `IORI_ADMISSION_IDENTITY`, `ORIGIN`, `VAPID_SUBJECT` and `IORI_CLOUDFLARE_DEPLOY_API_TOKEN`. It reads neither the Terraform state nor the transfer bucket. It looks up the D1, KV, Queue, DLQ and consumer ids by name through the Cloudflare API. If zero resources or two or more resources match a name, or if the Cloudflare API fails (including a 401 or 403 response), it prints an `IORI_DIAG` line with `stage=deploy-worker-resolve` and stops before `wrangler deploy`.

`put-worker-secrets` receives `CLOUDFLARE_ACCOUNT_ID`, `IORI_ADMISSION_IDENTITY`, `IORI_CLOUDFLARE_DEPLOY_API_TOKEN`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `SMOKE_QUEUE_TOKEN`. It updates only the Worker secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `SMOKE_QUEUE_TOKEN`.

`put-worker-secrets` also receives the optional `TWITTERAPI_IO_API_KEY`, the API key of twitterapi.io. It uploads the secret only when the GitHub secret has a value, and an empty value does not fail the operation. The Worker skips every X source and makes no twitterapi.io call while the secret is absent.

`delete-rehearsal-d1` receives only `CLOUDFLARE_ACCOUNT_ID` and `IORI_CLOUDFLARE_DEPLOY_API_TOKEN`. It deletes only the empty D1 databases `iori-production-prdrehearse1` to `iori-production-prdrehearse5`, and it runs only for the `production` Environment.

The source deployment and the source recovery operations use `IORI_SOURCE_SSH_HOST`, `IORI_SOURCE_SSH_USER`, `IORI_SOURCE_SSH_PRIVATE_KEY`, and `IORI_SOURCE_SSH_KNOWN_HOSTS`. The key and pinned known-hosts values become private files. Do not bootstrap trust with `ssh-keyscan`, supply source database credentials to the runner, or recreate source `env.conf` during this deployment.

The source deployment workflow `.github/workflows/deploy-iori.yml` for the old environment runs only by manual dispatch. It has no push trigger, so a merge does not start it. A merge can start `Deploy iori Worker (main)`, which waits for `production` approval. Before supplying source credentials and merging, configure required reviewers, select Protected branches only (`protected_branches=true`, `custom_branch_policies=false`), and protect the repository's `main` branch. This Environment policy permits protected branches; the workflows separately enforce `refs/heads/main` and the latest reviewed main SHA. Do not create custom deployment branch policies. The Environment name alone does not enforce approval. The Worker operations in `deploy-iori-worker.yml` remain manual dispatches.

The API scopes must match the fixed operation, including the actual readback APIs. Normal Worker deploy may update the existing producer Queue through Wrangler; it must preserve the full verified Queue/consumer/route configuration. It has no state-apply, signing, source-control, or application-import step. See the [cutover runbook](../../docs/operations/cloudflare-cutover-runbook.md) for the capability and recovery boundaries.

## Local validation

These commands validate the checked-in module without connecting to the backend or Cloudflare:

```sh
terraform fmt -check -recursive
terraform init -backend=false -input=false -lockfile=readonly
terraform validate
```

Use the pinned provider and lockfile. CI runs the same three commands as its Terraform validate step. See the [migration design](../../../../docs/superpowers/specs/2026-08-16-iori-cloudflare-complete-migration-design.md) for ownership and acceptance conditions.
