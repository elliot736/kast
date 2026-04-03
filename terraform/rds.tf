resource "aws_db_subnet_group" "main" {
  name       = "${local.name_prefix}-db"
  subnet_ids = aws_subnet.private[*].id

  tags = { Name = "${local.name_prefix}-db-subnet-group" }
}

resource "aws_rds_cluster" "main" {
  cluster_identifier = "${local.name_prefix}-pg"
  engine             = "aurora-postgresql"
  engine_version     = "17.4"
  engine_mode        = "provisioned"

  database_name   = var.db_name
  master_username = var.db_username
  master_password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  storage_encrypted   = true
  deletion_protection = true
  skip_final_snapshot = false
  final_snapshot_identifier = "${local.name_prefix}-pg-final"

  serverlessv2_scaling_configuration {
    min_capacity = 0.5
    max_capacity = 4
  }

  tags = { Name = "${local.name_prefix}-pg" }
}

resource "aws_rds_cluster_instance" "main" {
  count              = 1
  identifier         = "${local.name_prefix}-pg-${count.index}"
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.main.engine
  engine_version     = aws_rds_cluster.main.engine_version

  tags = { Name = "${local.name_prefix}-pg-${count.index}" }
}
