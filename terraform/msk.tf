resource "aws_msk_cluster" "main" {
  cluster_name           = "${local.name_prefix}-kafka"
  kafka_version          = "3.7.x.kraft"
  number_of_broker_nodes = var.msk_broker_count

  broker_node_group_info {
    instance_type   = var.msk_instance_type
    client_subnets  = aws_subnet.private[*].id
    security_groups = [aws_security_group.msk.id]

    storage_info {
      ebs_storage_info {
        volume_size = var.msk_ebs_volume_size
      }
    }
  }

  client_authentication {
    unauthenticated = true

    sasl {
      iam = true
    }
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "TLS_PLAINTEXT"
      in_cluster    = true
    }
  }

  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = aws_cloudwatch_log_group.msk.name
      }
    }
  }

  configuration_info {
    arn      = aws_msk_configuration.main.arn
    revision = aws_msk_configuration.main.latest_revision
  }

  tags = { Name = "${local.name_prefix}-kafka" }
}

resource "aws_msk_configuration" "main" {
  name              = "${local.name_prefix}-kafka-config"
  kafka_versions    = ["3.7.x.kraft"]
  description       = "Kast MSK configuration"

  server_properties = <<-PROPERTIES
    auto.create.topics.enable=true
    default.replication.factor=2
    min.insync.replicas=1
    num.partitions=3
    log.retention.hours=168
    log.cleanup.policy=delete,compact
  PROPERTIES
}
