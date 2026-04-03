variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "kast"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

# ---------- Networking ----------

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

# ---------- RDS ----------

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.medium"
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "kast"
}

variable "db_username" {
  description = "Database master username"
  type        = string
  default     = "kast"
}

variable "db_password" {
  description = "Database master password"
  type        = string
  sensitive   = true
}

# ---------- ECS ----------

variable "api_cpu" {
  description = "CPU units for API task (1024 = 1 vCPU)"
  type        = number
  default     = 1024
}

variable "api_memory" {
  description = "Memory (MiB) for API task"
  type        = number
  default     = 2048
}

variable "api_desired_count" {
  description = "Desired number of API tasks"
  type        = number
  default     = 2
}

variable "web_cpu" {
  description = "CPU units for Web task"
  type        = number
  default     = 512
}

variable "web_memory" {
  description = "Memory (MiB) for Web task"
  type        = number
  default     = 1024
}

variable "web_desired_count" {
  description = "Desired number of Web tasks"
  type        = number
  default     = 2
}

# ---------- MSK ----------

variable "msk_instance_type" {
  description = "MSK broker instance type"
  type        = string
  default     = "kafka.t3.small"
}

variable "msk_broker_count" {
  description = "Number of MSK broker nodes (must be multiple of AZ count)"
  type        = number
  default     = 2
}

variable "msk_ebs_volume_size" {
  description = "EBS volume size (GiB) per MSK broker"
  type        = number
  default     = 50
}

# ---------- App Config ----------

variable "better_auth_secret" {
  description = "Secret key for Better Auth (min 32 chars)"
  type        = string
  sensitive   = true
}

variable "domain_name" {
  description = "Domain name for the ALB (optional, leave empty to use ALB DNS)"
  type        = string
  default     = ""
}

variable "certificate_arn" {
  description = "ACM certificate ARN for HTTPS (required if domain_name is set)"
  type        = string
  default     = ""
}

variable "ping_retention_days" {
  description = "Number of days to retain ping data"
  type        = number
  default     = 30
}
