locals {
  prom_datasource_uid = "prometheus"
  # Proxmox pushes guest metrics to InfluxDB via its native metric server.
  influx_datasource_uid = "eev3nrqve78cgf"

  # Guests that are normally switched off, so a stopped status is expected.
  proxmox_stopped_guests = ["ark", "mc-server", "Opnsense", "qbit-linux-dev", "win-10-lab"]

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
      summary       = "Node exporter down on {{ $labels.instance }}"
      description   = "Prometheus cannot scrape node_exporter for {{ $labels.instance }} ({{ $labels.proxmox_guest }}). Check the VM and node_exporter service."
      dashboard_url = "https://monitoring.palvir.dev/d/obs-node-exporter"
    }

    data {
      ref_id = "A"
      relative_time_range {
        from = 600
        to   = 0
      }
      datasource_uid = local.prom_datasource_uid
      model = jsonencode({
        expr          = "up{job=\"prometheus.scrape.node_exporter\", on_demand!=\"true\"}"
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
            type   = "lt"
            params = [1]
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
      summary       = "Exporter scrape down ({{ $labels.job }} / {{ $labels.instance }})"
      description   = "An Alloy-managed exporter scrape target is down. Job {{ $labels.job }} on {{ $labels.instance }}."
      dashboard_url = "https://monitoring.palvir.dev/d/obs-monitoring-stack"
    }

    data {
      ref_id = "A"
      relative_time_range {
        from = 600
        to   = 0
      }
      datasource_uid = local.prom_datasource_uid
      model = jsonencode({
        expr          = "up{job=~\"prometheus.scrape.(nginx|pgsql|adguard)|cadvisor\", on_demand!=\"true\"}"
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
            type   = "lt"
            params = [1]
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
    name           = "Disk almost full"
    condition      = "C"
    for            = "10m"
    no_data_state  = "OK"
    exec_err_state = "Alerting"

    labels = merge(local.alert_labels, {
      severity = "warning"
    })

    annotations = {
      summary       = "Disk above 85% on {{ $labels.instance }} ({{ $labels.mountpoint }})"
      description   = "Filesystem {{ $labels.mountpoint }} is above 85% on {{ $labels.instance }} ({{ $labels.proxmox_guest }})."
      dashboard_url = "https://monitoring.palvir.dev/d/obs-node-exporter"
    }

    data {
      ref_id = "A"
      relative_time_range {
        from = 600
        to   = 0
      }
      datasource_uid = local.prom_datasource_uid
      model = jsonencode({
        expr          = "100 * (1 - node_filesystem_avail_bytes{job=\"prometheus.scrape.node_exporter\", fstype!~\"tmpfs|overlay|squashfs|aufs|rootfs|fuse.lxcfs\"} / node_filesystem_size_bytes{job=\"prometheus.scrape.node_exporter\", fstype!~\"tmpfs|overlay|squashfs|aufs|rootfs|fuse.lxcfs\"})"
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
            params = [85]
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
    name           = "Disk critical"
    condition      = "C"
    for            = "5m"
    no_data_state  = "OK"
    exec_err_state = "Alerting"

    labels = merge(local.alert_labels, {
      severity = "critical"
    })

    annotations = {
      summary       = "Disk above 95% on {{ $labels.instance }} ({{ $labels.mountpoint }})"
      description   = "Filesystem {{ $labels.mountpoint }} is above 95% on {{ $labels.instance }} ({{ $labels.proxmox_guest }}). Free it now."
      dashboard_url = "https://monitoring.palvir.dev/d/obs-node-exporter"
    }

    data {
      ref_id = "A"
      relative_time_range {
        from = 600
        to   = 0
      }
      datasource_uid = local.prom_datasource_uid
      model = jsonencode({
        expr          = "100 * (1 - node_filesystem_avail_bytes{job=\"prometheus.scrape.node_exporter\", fstype!~\"tmpfs|overlay|squashfs|aufs|rootfs|fuse.lxcfs\"} / node_filesystem_size_bytes{job=\"prometheus.scrape.node_exporter\", fstype!~\"tmpfs|overlay|squashfs|aufs|rootfs|fuse.lxcfs\"})"
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
    name           = "Inodes almost exhausted"
    condition      = "C"
    for            = "10m"
    no_data_state  = "OK"
    exec_err_state = "Alerting"

    labels = merge(local.alert_labels, {
      severity = "warning"
    })

    annotations = {
      summary       = "Inode usage above 90% on {{ $labels.instance }} ({{ $labels.mountpoint }})"
      description   = "Inodes on {{ $labels.mountpoint }} are above 90% on {{ $labels.instance }} ({{ $labels.proxmox_guest }})."
      dashboard_url = "https://monitoring.palvir.dev/d/obs-node-exporter"
    }

    data {
      ref_id = "A"
      relative_time_range {
        from = 600
        to   = 0
      }
      datasource_uid = local.prom_datasource_uid
      model = jsonencode({
        expr          = "100 * (1 - node_filesystem_files_free{job=\"prometheus.scrape.node_exporter\", fstype!~\"tmpfs|overlay|squashfs|aufs|rootfs|fuse.lxcfs\"} / node_filesystem_files{job=\"prometheus.scrape.node_exporter\", fstype!~\"tmpfs|overlay|squashfs|aufs|rootfs|fuse.lxcfs\"})"
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
      summary       = "Memory above 90% on {{ $labels.instance }}"
      description   = "Memory usage is above 90% on {{ $labels.instance }} ({{ $labels.proxmox_guest }})."
      dashboard_url = "https://monitoring.palvir.dev/d/obs-node-exporter"
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
    name           = "Host CPU high"
    condition      = "C"
    for            = "15m"
    no_data_state  = "OK"
    exec_err_state = "Alerting"

    labels = merge(local.alert_labels, {
      severity = "warning"
    })

    annotations = {
      summary       = "CPU above 90% on {{ $labels.instance }}"
      description   = "CPU usage has been above 90% for 15 minutes on {{ $labels.instance }} ({{ $labels.proxmox_guest }})."
      dashboard_url = "https://monitoring.palvir.dev/d/obs-node-exporter"
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
      summary       = "Proxmox guest stopped ({{ $labels.host }})"
      description   = "Guest {{ $labels.host }} ({{ $labels.object }}) is not running on Proxmox. Guests that are normally off (${join(", ", local.proxmox_stopped_guests)}) are excluded."
      dashboard_url = "https://monitoring.palvir.dev/d/obs-guest-reconcile"
    }

    data {
      ref_id = "A"
      relative_time_range {
        from = 600
        to   = 0
      }
      datasource_uid = local.influx_datasource_uid
      model = jsonencode({
        query         = <<-EOT
          from(bucket: "proxmox")
            |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
            |> filter(fn: (r) => r._measurement == "system" and r.object != "nodes" and r._field == "status")
            |> filter(fn: (r) => not contains(value: r.host, set: ${jsonencode(local.proxmox_stopped_guests)}))
            |> last()
            |> map(fn: (r) => ({r with _value: if r._value == "running" then 1.0 else 0.0}))
            |> group(columns: ["host", "object"])
            |> keep(columns: ["_time", "_value", "host", "object"])
        EOT
        refId         = "A"
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
            type   = "lt"
            params = [1]
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
      group_by      = ["alertname", "host"]
    }
  }
  rule {
    name           = "Prometheus unreachable"
    condition      = "C"
    for            = "2m"
    no_data_state  = "Alerting"
    exec_err_state = "Alerting"

    labels = merge(local.alert_labels, {
      severity = "critical"
    })

    annotations = {
      summary       = "Prometheus is not answering Grafana"
      description   = "Grafana cannot query Prometheus, so every other alert is blind. Check the prometheus container and its datasource health."
      dashboard_url = "https://monitoring.palvir.dev/d/obs-monitoring-stack"
    }

    data {
      ref_id = "A"
      relative_time_range {
        from = 600
        to   = 0
      }
      datasource_uid = local.prom_datasource_uid
      model = jsonencode({
        expr          = "up{job=\"prometheus\"}"
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
            type   = "lt"
            params = [1]
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
    name           = "Alloy unreachable"
    condition      = "C"
    for            = "5m"
    no_data_state  = "OK"
    exec_err_state = "Alerting"

    labels = merge(local.alert_labels, {
      severity = "critical"
    })

    annotations = {
      summary       = "Alloy is not reachable"
      description   = "Prometheus cannot scrape Alloy. Scrapes, OTLP ingest and log shipping are all down."
      dashboard_url = "https://monitoring.palvir.dev/d/obs-monitoring-stack"
    }

    data {
      ref_id = "A"
      relative_time_range {
        from = 600
        to   = 0
      }
      datasource_uid = local.prom_datasource_uid
      model = jsonencode({
        expr          = "up{job=\"prometheus.scrape.alloy\"}"
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
            type   = "lt"
            params = [1]
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
    name           = "Monitoring stack container missing"
    condition      = "C"
    for            = "5m"
    no_data_state  = "OK"
    exec_err_state = "Alerting"

    labels = merge(local.alert_labels, {
      severity = "critical"
    })

    annotations = {
      summary       = "{{ $labels.name }} container is gone"
      description   = "cAdvisor no longer reports the {{ $labels.name }} container on the monitoring host. Check the compose service."
      dashboard_url = "https://monitoring.palvir.dev/d/obs-monitoring-stack"
    }

    data {
      ref_id = "A"
      relative_time_range {
        from = 600
        to   = 0
      }
      datasource_uid = local.prom_datasource_uid
      model = jsonencode({
        expr          = "(absent(container_last_seen{job=\"cadvisor\", instance=\"cadvisor:8080\", name=\"grafana\"}) or absent(container_last_seen{job=\"cadvisor\", instance=\"cadvisor:8080\", name=\"loki\"}) or absent(container_last_seen{job=\"cadvisor\", instance=\"cadvisor:8080\", name=\"tempo\"}) or absent(container_last_seen{job=\"cadvisor\", instance=\"cadvisor:8080\", name=\"mcp-grafana\"}) or absent(container_last_seen{job=\"cadvisor\", instance=\"cadvisor:8080\", name=\"telegram-agent\"})) and on() (up{job=\"cadvisor\", instance=\"cadvisor:8080\"} == 1)"
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
    name           = "Proxmox metrics missing"
    condition      = "C"
    for            = "15m"
    no_data_state  = "Alerting"
    exec_err_state = "Alerting"

    labels = merge(local.alert_labels, {
      severity = "warning"
    })

    annotations = {
      summary       = "Proxmox metrics missing from InfluxDB"
      description   = "No Proxmox system metrics in the last 10 minutes. Check the PVE metric server and the InfluxDB datasource; Guest reconcile and the guest-stopped alert depend on it."
      dashboard_url = "https://monitoring.palvir.dev/d/obs-guest-reconcile"
    }

    data {
      ref_id = "A"
      relative_time_range {
        from = 600
        to   = 0
      }
      datasource_uid = local.influx_datasource_uid
      model = jsonencode({
        query         = <<-EOT
          from(bucket: "proxmox")
            |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
            |> filter(fn: (r) => r._measurement == "system" and r._field == "status")
            |> last()
            |> count()
            |> group()
            |> sum()
        EOT
        refId         = "A"
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
            type   = "lt"
            params = [1]
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
}
