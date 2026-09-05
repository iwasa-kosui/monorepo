variable "cloudflare_account_id" {
  description = "Cloudflare account ID. Supply through TF_VAR_cloudflare_account_id in a protected runner."
  type        = string
  sensitive   = true
}

variable "zone_id" {
  description = "Existing Cloudflare zone ID. Supply through TF_VAR_zone_id in a protected runner."
  type        = string
  sensitive   = true
}

variable "environment" {
  description = "Deployment environment. Terraform workspaces are deliberately not used."
  type        = string

  validation {
    condition     = contains(["production", "staging"], var.environment)
    error_message = "environment must be production or staging."
  }
}

variable "worker_name" {
  description = "Existing Wrangler-owned Worker service name."
  type        = string
}

variable "public_hostname" {
  description = "Hostname for the opt-in production Worker route."
  type        = string
  default     = "blog.example.invalid"
}

variable "d1_database_name" {
  description = "Optional D1 database name override."
  type        = string
  default     = null
  nullable    = true
}

variable "r2_bucket_name" {
  description = "Optional R2 bucket name override."
  type        = string
  default     = null
  nullable    = true
}

variable "kv_namespace_name" {
  description = "Optional Fedify KV namespace title override."
  type        = string
  default     = null
  nullable    = true
}

variable "queue_name" {
  description = "Optional Fedify queue name override."
  type        = string
  default     = null
  nullable    = true
}

variable "dead_letter_queue_name" {
  description = "Optional Fedify dead-letter queue name override."
  type        = string
  default     = null
  nullable    = true
}

variable "enable_production_worker_route" {
  description = "Explicit cutover switch for the production Worker route."
  type        = bool
  default     = false

  validation {
    condition     = !var.enable_production_worker_route || var.environment == "production"
    error_message = "enable_production_worker_route can be true only for production."
  }
}

variable "migration_bucket_name" {
  description = "Optional dedicated private migration bucket name override. Never use the Terraform state or uploads bucket."
  type        = string
  default     = null
  nullable    = true
}
