# Grafana Alloy Runtime

## Overview

`config.alloy` is the active runtime pipeline for this stack. It is intentionally scoped to the telemetry sources that are actually wired today:

- OTLP metrics, traces, and logs from instrumented applications
- Prometheus scraping for infrastructure exporters
- Docker container logs
- Local system logs

Optional example material for broader setups still exists in this directory, but it is not part of the default runtime configuration.

## Active Data Flow

### Applications

- OTLP in to Alloy
- Metrics out to Prometheus via Prometheus's OTLP receiver
- Traces out to Tempo
- Logs out to Loki via Loki's OTLP endpoint

### Infrastructure

- Alloy scrapes Prometheus exporters and remote-writes those metrics to Prometheus
- Alloy tails Docker logs and local system logs and forwards them to Loki
- Prometheus self-scraping stays in `prometheus/prometheus.yml`, not in Alloy

## Exporters and Log Sources

### Metrics

- AdGuard exporter
- Nginx Prometheus exporter
- PostgreSQL exporter
- Proxmox exporter
- Alloy self-scrape
- Host unix exporter
- External node exporters
- qBittorrent exporter

### Logs

- OTLP application logs
- Docker container logs
- Local system logs from `/var/log/syslog` and `/var/log/kern.log`

## Ports

| Service | Port | Purpose |
|---|---:|---|
| Alloy | `12345` | UI and self-metrics |
| Alloy | `4318` | OTLP gRPC receiver |
| Alloy | `4319` | OTLP HTTP receiver |
| Prometheus | `9090` | UI and API |
| Loki | `3100` | API |
| Tempo | `3200` | API |
| Tempo | `4317` | OTLP gRPC receiver |

## Notes

- The runtime config does **not** currently ingest OPNsense syslog.
- The runtime config does **not** currently parse nginx access or error log files.
- Application metrics are expected to arrive over OTLP rather than a legacy app `/metrics` scrape.
- `alloy/OPNSENSE_SETUP.md`, `alloy/DISTRIBUTED_TRACING.md`, `alloy/nginx-otel-example.conf`, and `alloy/otel-nginx.toml` are reference material only unless you wire those sources back in.

## Validation

After changes to `config.alloy`, validate with:

```bash
docker compose config >/dev/null
```

Then restart Alloy and verify the expected receivers and scrapes in the Alloy UI at `http://localhost:12345`.
