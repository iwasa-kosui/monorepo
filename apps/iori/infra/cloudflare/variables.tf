variable "cloudflare_account_id" {
  description = "Cloudflare account ID."
  type        = string
  sensitive   = true
}

variable "zone_id" {
  description = "ID of the existing Cloudflare zone that hosts the Worker route."
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
  description = "Whether to create the production Worker route."
  type        = bool
  default     = false

  validation {
    condition     = !var.enable_production_worker_route || var.environment == "production"
    error_message = "enable_production_worker_route can be true only for production."
  }
}


variable "generation" {
  description = "Generation identifier used in resource names and the state key."
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9]{7,19}$", var.generation))
    error_message = "generation must be 8-20 lowercase alphanumeric characters starting with a letter."
  }
}
variable "attach_queue_consumer" {
  description = "Whether to attach the Worker as the Queue consumer."
  type        = bool
  default     = false
}
variable "queue_delivery_paused" {
  description = "Whether delivery of the main Queue is paused."
  type        = bool
  default     = true
}

variable "enable_staging_worker_route" {
  description = "Whether to create the staging Worker route."
  type        = bool
  default     = false
  validation {
    condition     = !var.enable_staging_worker_route || var.environment == "staging"
    error_message = "enable_staging_worker_route can be true only for staging."
  }
}
