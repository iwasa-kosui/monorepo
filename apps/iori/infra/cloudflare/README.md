# iori Cloudflare Terraform

Terraform owns D1, R2, the Fedify KV namespace, Queues, the Queue consumer, and the opt-in Worker route. Wrangler owns the Worker service, versions, bindings, assets, observability, secrets, and D1 migrations.

## Protected inputs

Set `TF_VAR_cloudflare_account_id`, `TF_VAR_zone_id`, `TF_VAR_environment`, `TF_VAR_worker_name`, and, only for a reviewed production cutover, `TF_VAR_enable_production_worker_route=true` in the protected runner. The Cloudflare provider reads `CLOUDFLARE_API_TOKEN` directly from that runner.

Copy `example.config.s3.tfbackend` to the ignored `config.s3.tfbackend`, replace its fixture bucket and add its S3-compatible endpoint and credentials only in the protected runner. Use exactly one state key per environment:

- `apps/iori/cloudflare/staging.tfstate`
- `apps/iori/cloudflare/production.tfstate`

Terraform workspaces are not used. Initialise the selected state explicitly:

```sh
terraform init -backend-config=config.s3.tfbackend
```

For local configuration validation, no backend or Cloudflare API access is needed:

```sh
terraform fmt -check -recursive
terraform init -backend=false -input=false
terraform validate
```

## Importing existing resources

Before the first apply, pass D1, R2, KV, Queue, account, and API-token values only through environment variables or protected stdin. The import command emits only Terraform addresses. With `--execute`, it queries the current Queue consumer, imports it when present, and otherwise leaves Terraform to create it. Never run this command from a developer workstation against production.

```sh
node import-existing-resources.mjs --execute
```

The script never prints import identifiers. Its optional `--output` target must be outside this repository and is written with mode `0600`.

## Binding handoff

`worker_bindings` is a sensitive Terraform output. A deploy runner reads `terraform output -json` into memory or a mode `0600` temporary file, renders the temporary Wrangler config, and removes both before the job ends. Do not print or upload the output, plan JSON, state, backend configuration, or generated Wrangler config.
