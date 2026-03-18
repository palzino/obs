# obs
A ready-to-run observability stack built around Alloy, Prometheus, Loki, Tempo, and Grafana.

## Features
- **Grafana Alloy**: OTLP collector plus Prometheus scraping
- **Prometheus**: Metrics storage and querying
- **Loki**: Log aggregation
- **Tempo**: Distributed tracing
- **Grafana**: Unified visualization
- **Exporters**: AdGuard, Nginx, PostgreSQL, Proxmox, node exporters, qBittorrent

## Quick Start
```bash
# Start all services
docker-compose up -d

# Access Grafana
open http://localhost:3000

# Access Prometheus
open http://localhost:9090

# Access Alloy UI
open http://localhost:12345
```

## Runtime Scope
The active runtime configuration currently covers:

- **OTLP receivers** for application metrics, traces, and logs
- **Prometheus scraping** for infrastructure exporters
- **Docker and local system logs** into Loki
- **Native OTLP** metrics into Prometheus and logs into Loki

### Quick Links
- **[Alloy Configuration Guide](alloy/README.md)** - Active runtime configuration
- **[Distributed Tracing Setup](alloy/DISTRIBUTED_TRACING.md)** - Reference notes for broader tracing setups
- **[OPNsense Setup](alloy/OPNSENSE_SETUP.md)** - Optional example, not part of the default runtime
- **[Nginx Example Config](alloy/nginx-otel-example.conf)** - Optional example config

## Ports
- `3000` - Grafana UI
- `3100` - Loki API
- `3200` - Tempo API
- `4317` - Tempo OTLP gRPC
- `4318` - Alloy OTLP gRPC (metrics, traces, logs)
- `4319` - Alloy OTLP HTTP (metrics, traces, logs)
- `9090` - Prometheus UI & API
- `12345` - Alloy UI & Metrics

### Exporters
- `9113` - Nginx Prometheus Exporter
- `9187` - PostgreSQL Prometheus Exporter
- `9221` - Proxmox Prometheus Exporter
- `9617` - AdGuard Prometheus Exporter
