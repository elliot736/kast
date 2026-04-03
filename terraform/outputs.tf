output "alb_dns_name" {
  description = "ALB DNS name — use this to access Kast (or point your domain here)"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "ALB hosted zone ID (for Route 53 alias records)"
  value       = aws_lb.main.zone_id
}

output "ecr_api_url" {
  description = "ECR repository URL for the API image"
  value       = aws_ecr_repository.api.repository_url
}

output "ecr_web_url" {
  description = "ECR repository URL for the Web image"
  value       = aws_ecr_repository.web.repository_url
}

output "rds_endpoint" {
  description = "RDS Aurora cluster endpoint"
  value       = aws_rds_cluster.main.endpoint
}

output "msk_brokers" {
  description = "MSK bootstrap brokers (plaintext)"
  value       = aws_msk_cluster.main.bootstrap_brokers
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}
