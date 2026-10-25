locals {
  generation_prefix      = "iori-${var.environment}-${var.generation}"
  d1_database_name       = local.generation_prefix
  r2_bucket_name         = "${local.generation_prefix}-uploads"
  kv_namespace_name      = "${local.generation_prefix}-fedify"
  queue_name             = "${local.generation_prefix}-fedify"
  dead_letter_queue_name = "${local.generation_prefix}-dlq"
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
  settings   = { delivery_paused = true }

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_queue" "fedify" {
  account_id = var.cloudflare_account_id
  queue_name = local.queue_name
  settings   = { delivery_paused = var.queue_delivery_paused }

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_queue_consumer" "fedify" {
  count             = var.attach_queue_consumer ? 1 : 0
  account_id        = var.cloudflare_account_id
  queue_id          = cloudflare_queue.fedify.queue_id
  type              = "worker"
  script_name       = local.generation_prefix
  dead_letter_queue = cloudflare_queue.fedify_dlq.queue_name

  settings = {
    batch_size       = 1
    max_wait_time_ms = 1000
    max_retries      = 3
    retry_delay      = 30
  }
}

resource "cloudflare_workers_route" "iori" {
  count = (var.enable_production_worker_route || var.enable_staging_worker_route) ? 1 : 0

  zone_id = var.zone_id
  pattern = "${var.public_hostname}/*"
  script  = local.generation_prefix

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = (var.environment == "production" && var.enable_production_worker_route && !var.enable_staging_worker_route) || (var.environment == "staging" && var.enable_staging_worker_route && !var.enable_production_worker_route)
      error_message = "The Worker route requires the matching environment cutover switch."
    }
  }
}

resource "cloudflare_r2_bucket" "migration" {
  account_id = var.cloudflare_account_id
  name       = "${local.generation_prefix}-transfer"

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = "${local.generation_prefix}-transfer" != local.r2_bucket_name
      error_message = "The migration bucket must be separate from the application uploads bucket."
    }
  }
}

resource "cloudflare_r2_managed_domain" "migration" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.migration.name
  enabled     = false
}
