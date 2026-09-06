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


variable "public_hostname" {
  description = "Protected environment hostname for the opt-in Worker route."
  type        = string
  default     = "blog.example.invalid"
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


variable "generation" {
  description = "Fresh isolated generation. Never reuse an old generation or state."
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9]{7,19}$", var.generation))
    error_message = "generation must be 8-20 lowercase alphanumeric characters starting with a letter."
  }
}
variable "attach_queue_consumer" {
  description = "Attach only after the first sealed Worker has been deployed and read back."
  type        = bool
  default     = false
}
variable "queue_delivery_paused" {
  description = "Keep true through preparation, import, verification and smoke. Resume last."
  type        = bool
  default     = true
}

variable "enable_staging_worker_route" {
  description = "Explicit rehearsal switch for the isolated staging hostname route."
  type        = bool
  default     = false
  validation {
    condition     = !var.enable_staging_worker_route || var.environment == "staging"
    error_message = "enable_staging_worker_route can be true only for staging."
  }
}
