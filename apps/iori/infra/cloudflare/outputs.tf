output "worker_bindings" {
  sensitive = true
  value = {
    d1_database_id  = cloudflare_d1_database.iori.id
    r2_bucket_name  = cloudflare_r2_bucket.uploads.name
    kv_namespace_id = cloudflare_workers_kv_namespace.fedify.id
    queue_name      = cloudflare_queue.fedify.queue_name
    worker_name     = local.generation_prefix
  }
}

output "migration_storage" {
  sensitive = true
  value = {
    bucket_name = cloudflare_r2_bucket.migration.name
    environment = var.environment
  }
}

output "target_identity" {
  sensitive = true
  value = {
    account_id       = var.cloudflare_account_id
    environment      = var.environment
    generation       = var.generation
    backend_key      = "iori/${var.environment}/${var.generation}/terraform.tfstate"
    worker_name      = local.generation_prefix
    d1_database_name = local.d1_database_name
    queue_id         = cloudflare_queue.fedify.queue_id
    dlq_id           = cloudflare_queue.fedify_dlq.queue_id
    queue_settings   = cloudflare_queue.fedify.settings
    dlq_settings     = cloudflare_queue.fedify_dlq.settings
    consumer         = cloudflare_queue_consumer.fedify
  }
}
