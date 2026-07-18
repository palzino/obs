locals {
  prom_datasource_uid = "prometheus"

  alert_labels = {
    team = "obs"
  }

  alert_notification_settings = {
    contact_point = "telegram"
    group_by      = ["alertname", "instance", "job"]
  }
}

resource "grafana_rule_group" "obs_infrastructure" {
  provider = grafana.grafana

  name             = "obs infrastructure"
  folder_uid       = grafana_folder.obs.uid
  interval_seconds = 60

  rule {
    name           = "Node exporter down"
    condition      = "C"
    for            = "5m"
    no_data_state  = "OK"
    exec_err_state = "Alerting"

    labels = merge(local.alert_labels, {
      severity = "critical"
    })

    annotations = {
      summary     = "Node exporter down on {{ $labels.instance }}"
      description = "Prometheus cannot scrape node_exporter for {{ $labels.instance }} ({{ $labels.proxmox_guest }}). Check the VM and node_exporter service."
    }

    data {
      ref_id = "A"
      relative_time_range {
        from = 600
        to   = 0
      }
      datasource_uid = local.prom_datasource_uid
      model = jsonencode({
        expr          = "up{job=\"prometheus.scrape.node_exporter\"} == 0"
        refId         = "A"
        editorMode    = "code"
        instant       = true
        range         = false
        intervalMs    = 1000
        maxDataPoints = 43200
      })
    }

    data {
      ref_id         = "B"
      datasource_uid = "__expr__"
      relative_time_range {
        from = 0
        to   = 0
      }
      model = jsonencode({
        type       = "reduce"
        expression = "A"
        reducer    = "last"
        refId      = "B"
      })
    }

    data {
      ref_id         = "C"
      datasource_uid = "__expr__"
      relative_time_range {
        from = 0
        to   = 0
      }
      model = jsonencode({
        type       = "threshold"
        expression = "B"
        refId      = "C"
        conditions = [{
          evaluator = {
            type   = "gt"
            params = [0]
          }
          operator = {
            type = "and"
          }
          reducer = {
            type = "last"
          }
        }]
      })
    }

    notification_settings {
      contact_point = local.alert_notification_settings.contact_point
      group_by      = local.alert_notification_settings.group_by
    }
  }

  rule {
    name           = "Alloy exporter down"
    condition      = "C"
    for            = "5m"
    no_data_state  = "OK"
    exec_err_state = "Alerting"

    labels = merge(local.alert_labels, {
      severity = "critical"
    })

    annotations = {
      summary     = "Exporter scrape down ({{ $labels.job }} / {{ $labels.instance }})"
      description = "An Alloy-managed exporter scrape target is down. Job {{ $labels.job }} on {{ $labels.instance }}."
    }

    data {
      ref_id = "A"
      relative_time_range {
        from = 600
        to   = 0
      }
      datasource_uid = local.prom_datasource_uid
      model = jsonencode({
        expr          = "up{job=~\"prometheus.scrape.(nginx|pgsql|adguard|proxmox|cadvisor|qbittorrent)\"} == 0"
        refId         = "A"
        editorMode    = "code"
        instant       = true
        range         = false
        intervalMs    = 1000
        maxDataPoints = 43200
      })
    }

    data {
      ref_id         = "B"
      datasource_uid = "__expr__"
      relative_time_range {
        from = 0
        to   = 0
      }
      model = jsonencode({
        type       = "reduce"
        expression = "A"
        reducer    = "last"
        refId      = "B"
      })
    }

    data {
      ref_id         = "C"
      datasource_uid = "__expr__"
      relative_time_range {
        from = 0
        to   = 0
      }
      model = jsonencode({
        type       = "threshold"
        expression = "B"
        refId      = "C"
        conditions = [{
          evaluator = {
            type   = "gt"
            params = [0]
          }
          operator = {
            type = "and"
          }
          reducer = {
            type = "last"
          }
        }]
      })
    }

    notification_settings {
      contact_point = local.alert_notification_settings.contact_point
      group_by      = local.alert_notification_settings.group_by
    }
  }

  rule {
    name           = "Root disk almost full"
    condition      = "C"
    for            = "10m"
    no_data_state  = "OK"
    exec_err_state = "Alerting"

    labels = merge(local.alert_labels, {
      severity = "warning"
    })

    annotations = {
      summary     = "Root disk above 90% on {{ $labels.instance }}"
      description = "Root filesystem usage is above 90% on {{ $labels.instance }} ({{ $labels.proxmox_guest }})."
    }

    data {
      ref_id = "A"
      relative_time_range {
        from = 600
        to   = 0
      }
      datasource_uid = local.prom_datasource_uid
      model = jsonencode({
        expr          = "100 * (1 - node_filesystem_avail_bytes{job=\"prometheus.scrape.node_exporter\", mountpoint=\"/\", fstype!~\"tmpfs|overlay|squashfs|aufs|rootfs\"} / node_filesystem_size_bytes{job=\"prometheus.scrape.node_exporter\", mountpoint=\"/\", fstype!~\"tmpfs|overlay|squashfs|aufs|rootfs\"})"
        refId         = "A"
        editorMode    = "code"
        instant       = true
        range         = false
        intervalMs    = 1000
        maxDataPoints = 43200
      })
    }

    data {
      ref_id         = "B"
      datasource_uid = "__expr__"
      relative_time_range {
        from = 0
        to   = 0
      }
      model = jsonencode({
        type       = "reduce"
        expression = "A"
        reducer    = "last"
        refId      = "B"
      })
    }

    data {
      ref_id         = "C"
      datasource_uid = "__expr__"
      relative_time_range {
        from = 0
        to   = 0
      }
      model = jsonencode({
        type       = "threshold"
        expression = "B"
        refId      = "C"
        conditions = [{
          evaluator = {
            type   = "gt"
            params = [90]
          }
          operator = {
            type = "and"
          }
          reducer = {
            type = "last"
          }
        }]
      })
    }

    notification_settings {
      contact_point = local.alert_notification_settings.contact_point
      group_by      = local.alert_notification_settings.group_by
    }
  }

  rule {
    name           = "Host memory high"
    condition      = "C"
    for            = "10m"
    no_data_state  = "OK"
    exec_err_state = "Alerting"

    labels = merge(local.alert_labels, {
      severity = "warning"
    })

    annotations = {
      summary     = "Memory above 95% on {{ $labels.instance }}"
      description = "Memory usage is above 95% on {{ $labels.instance }} ({{ $labels.proxmox_guest }})."
    }

    data {
      ref_id = "A"
      relative_time_range {
        from = 600
        to   = 0
      }
      datasource_uid = local.prom_datasource_uid
      model = jsonencode({
        expr          = "100 * (1 - node_memory_MemAvailable_bytes{job=\"prometheus.scrape.node_exporter\"} / node_memory_MemTotal_bytes{job=\"prometheus.scrape.node_exporter\"})"
        refId         = "A"
        editorMode    = "code"
        instant       = true
        range         = false
        intervalMs    = 1000
        maxDataPoints = 43200
      })
    }

    data {
      ref_id         = "B"
      datasource_uid = "__expr__"
      relative_time_range {
        from = 0
        to   = 0
      }
      model = jsonencode({
        type       = "reduce"
        expression = "A"
        reducer    = "last"
        refId      = "B"
      })
    }

    data {
      ref_id         = "C"
      datasource_uid = "__expr__"
      relative_time_range {
        from = 0
        to   = 0
      }
      model = jsonencode({
        type       = "threshold"
        expression = "B"
        refId      = "C"
        conditions = [{
          evaluator = {
            type   = "gt"
            params = [95]
          }
          operator = {
            type = "and"
          }
          reducer = {
            type = "last"
          }
        }]
      })
    }

    notification_settings {
      contact_point = local.alert_notification_settings.contact_point
      group_by      = local.alert_notification_settings.group_by
    }
  }

  rule {
    name           = "Host CPU high"
    condition      = "C"
    for            = "15m"
    no_data_state  = "OK"
    exec_err_state = "Alerting"

    labels = merge(local.alert_labels, {
      severity = "warning"
    })

    annotations = {
      summary     = "CPU above 90% on {{ $labels.instance }}"
      description = "CPU usage has been above 90% for 15 minutes on {{ $labels.instance }} ({{ $labels.proxmox_guest }})."
    }

    data {
      ref_id = "A"
      relative_time_range {
        from = 900
        to   = 0
      }
      datasource_uid = local.prom_datasource_uid
      model = jsonencode({
        expr          = "100 - (avg by (instance, proxmox_guest, job) (rate(node_cpu_seconds_total{job=\"prometheus.scrape.node_exporter\", mode=\"idle\"}[5m])) * 100)"
        refId         = "A"
        editorMode    = "code"
        instant       = true
        range         = false
        intervalMs    = 1000
        maxDataPoints = 43200
      })
    }

    data {
      ref_id         = "B"
      datasource_uid = "__expr__"
      relative_time_range {
        from = 0
        to   = 0
      }
      model = jsonencode({
        type       = "reduce"
        expression = "A"
        reducer    = "last"
        refId      = "B"
      })
    }

    data {
      ref_id         = "C"
      datasource_uid = "__expr__"
      relative_time_range {
        from = 0
        to   = 0
      }
      model = jsonencode({
        type       = "threshold"
        expression = "B"
        refId      = "C"
        conditions = [{
          evaluator = {
            type   = "gt"
            params = [90]
          }
          operator = {
            type = "and"
          }
          reducer = {
            type = "last"
          }
        }]
      })
    }

    notification_settings {
      contact_point = local.alert_notification_settings.contact_point
      group_by      = local.alert_notification_settings.group_by
    }
  }

  rule {
    name           = "Proxmox guest stopped"
    condition      = "C"
    for            = "5m"
    no_data_state  = "OK"
    exec_err_state = "Alerting"

    labels = merge(local.alert_labels, {
      severity = "warning"
    })

    annotations = {
      summary     = "Proxmox guest stopped ({{ $labels.name }})"
      description = "Guest {{ $labels.name }} ({{ $labels.type }}) is not running on Proxmox. Hot-standby Opnsense is excluded."
    }

    data {
      ref_id = "A"
      relative_time_range {
        from = 600
        to   = 0
      }
      datasource_uid = local.prom_datasource_uid
      model = jsonencode({
        expr          = "(pve_up == 0) and on(id) pve_guest_info{template=\"0\", name!=\"Opnsense\"}"
        refId         = "A"
        editorMode    = "code"
        instant       = true
        range         = false
        intervalMs    = 1000
        maxDataPoints = 43200
      })
    }

    data {
      ref_id         = "B"
      datasource_uid = "__expr__"
      relative_time_range {
        from = 0
        to   = 0
      }
      model = jsonencode({
        type       = "reduce"
        expression = "A"
        reducer    = "last"
        refId      = "B"
      })
    }

    data {
      ref_id         = "C"
      datasource_uid = "__expr__"
      relative_time_range {
        from = 0
        to   = 0
      }
      model = jsonencode({
        type       = "threshold"
        expression = "B"
        refId      = "C"
        conditions = [{
          evaluator = {
            type   = "gt"
            params = [0]
          }
          operator = {
            type = "and"
          }
          reducer = {
            type = "last"
          }
        }]
      })
    }

    notification_settings {
      contact_point = local.alert_notification_settings.contact_point
      group_by      = ["alertname", "name", "type"]
    }
  }
}
