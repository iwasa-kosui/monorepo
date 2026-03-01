variable "db_master_username" {
  description = "The master username for the database"
  type        = string
  default     = "microblog"
}

variable "db_master_password" {
  description = "The master password for the database"
  type        = string
  sensitive   = true
}

resource "aws_lightsail_database" "microblog" {
  relational_database_name = "microblog-db"

  blueprint_id = "postgres_17"
  bundle_id    = "micro_2_0"

  availability_zone   = "ap-northeast-1a"

  master_database_name = "microblog"
  master_username      = var.db_master_username
  master_password      = var.db_master_password

  tags = {
    name = "microblog"
  }
}

