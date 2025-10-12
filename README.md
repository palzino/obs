# obs
A ready to deploy setup for prometheus and grafana metrics monitoring for Adguard, Nginx, PGSQL and Proxmox.

## Features
- **Grafana Alloy**: OpenTelemetry collector for metrics, traces, and logs
- **Prometheus**: Metrics storage and querying
- **Loki**: Log aggregation
- **Tempo**: Distributed tracing
- **Grafana**: Unified visualization dashboard
- **Exporters**: AdGuard, Nginx, PostgreSQL, Proxmox

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

## Distributed Tracing & Log Correlation
Track requests from firewall → proxy → application → backend with full observability:

- **📊 OTLP Receivers**: gRPC (4318), HTTP (4319)
- **🔥 OPNsense Integration**: Firewall logs via syslog (5514)
- **🌐 Nginx Tracing**: Access logs with trace IDs
- **🐳 Container Logs**: Automatic trace correlation
- **📈 Metrics Extraction**: Derive metrics from logs

### Quick Links
- **[Alloy Configuration Guide](alloy/README.md)** - Complete setup overview
- **[Distributed Tracing Setup](alloy/DISTRIBUTED_TRACING.md)** - End-to-end request tracking
- **[OPNsense Setup](alloy/OPNSENSE_SETUP.md)** - Firewall log integration
- **[Nginx Example Config](alloy/nginx-otel-example.conf)** - Nginx with OpenTelemetry

## Ports
- `3000` - Grafana UI
- `3100` - Loki API
- `3200` - Tempo API
- `4317` - Tempo OTLP gRPC
- `4318` - Alloy OTLP gRPC (metrics, traces, logs)
- `4319` - Alloy OTLP HTTP (metrics, traces, logs)
- `5140` - Alloy OTLP Syslog (TCP/UDP)
- `5514` - Alloy Loki Syslog for OPNsense (TCP/UDP)
- `9090` - Prometheus UI & API
- `12345` - Alloy UI & Metrics

### Exporters
- `9113` - Nginx Prometheus Exporter
- `9187` - PostgreSQL Prometheus Exporter
- `9221` - Proxmox Prometheus Exporter
- `9617` - AdGuard Prometheus Exporter
