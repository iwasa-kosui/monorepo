locals {
  environment_suffix = var.environment == "production" ? "" : "-${var.environment}"

  d1_database_name       = coalesce(var.d1_database_name, "iori${local.environment_suffix}")
  r2_bucket_name         = coalesce(var.r2_bucket_name, "iori-uploads${local.environment_suffix}")
  kv_namespace_name      = coalesce(var.kv_namespace_name, "iori-fedify${local.environment_suffix}")
  queue_name             = coalesce(var.queue_name, "iori-fedify${local.environment_suffix}")
  dead_letter_queue_name = coalesce(var.dead_letter_queue_name, "iori-fedify-dlq${local.environment_suffix}")
}

resource "cloudflare_d1_database" "iori" {
  account_id = var.cloudflare_account_id
  name       = local.d1_database_name

  read_replication = {
    mode = "disabled"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_r2_bucket" "uploads" {
  account_id = var.cloudflare_account_id
  name       = local.r2_bucket_name

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_workers_kv_namespace" "fedify" {
  account_id = var.cloudflare_account_id
  title      = local.kv_namespace_name

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_queue" "fedify_dlq" {
  account_id = var.cloudflare_account_id
  queue_name = local.dead_letter_queue_name

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_queue" "fedify" {
  account_id = var.cloudflare_account_id
  queue_name = local.queue_name

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_queue_consumer" "fedify" {
  account_id  = var.cloudflare_account_id
  queue_id    = cloudflare_queue.fedify.queue_id
  type        = "worker"
  script_name = var.worker_name

  settings = {
    batch_size        = 1
    max_wait_time_ms  = 1000
    max_retries       = 3
    retry_delay       = 30
    dead_letter_queue = cloudflare_queue.fedify_dlq.queue_id
  }
}

resource "cloudflare_workers_route" "iori" {
  count = var.enable_production_worker_route ? 1 : 0

  zone_id = var.zone_id
  pattern = "${var.public_hostname}/*"
  script  = var.worker_name

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = var.environment == "production"
      error_message = "The Worker route is only available in the production cutover plan."
    }
  }
}

resource "cloudflare_r2_bucket" "migration" {
  account_id = var.cloudflare_account_id
  name       = coalesce(var.migration_bucket_name, "iori-migration-${var.environment}")

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = coalesce(var.migration_bucket_name, "iori-migration-${var.environment}") != local.r2_bucket_name
      error_message = "The migration bucket must be separate from the application uploads bucket."
    }
  }
}

resource "cloudflare_r2_managed_domain" "migration" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.migration.name
  enabled     = false
}
