resource "aws_secretsmanager_secret" "better_auth" {
  name                    = "${local.name_prefix}/better-auth-secret"
  description             = "Better Auth secret key"
  recovery_window_in_days = 7

  tags = { Name = "${local.name_prefix}-better-auth-secret" }
}

resource "aws_secretsmanager_secret_version" "better_auth" {
  secret_id     = aws_secretsmanager_secret.better_auth.id
  secret_string = var.better_auth_secret
}

resource "aws_secretsmanager_secret" "db_password" {
  name                    = "${local.name_prefix}/db-password"
  description             = "RDS master password"
  recovery_window_in_days = 7

  tags = { Name = "${local.name_prefix}-db-password" }
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = var.db_password
}
