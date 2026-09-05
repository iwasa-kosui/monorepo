output "worker_bindings" {
  sensitive = true
  value = {
    d1_database_id  = cloudflare_d1_database.iori.id
    r2_bucket_name  = cloudflare_r2_bucket.uploads.name
    kv_namespace_id = cloudflare_workers_kv_namespace.fedify.id
    queue_name      = cloudflare_queue.fedify.queue_name
    worker_name     = var.worker_name
  }
}

output "migration_storage" {
  sensitive = true
  value = {
    bucket_name = cloudflare_r2_bucket.migration.name
    environment = var.environment
  }
}
