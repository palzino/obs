# Grafana Alloy Configuration

## Overview
This Alloy configuration provides **end-to-end observability** with distributed tracing, log correlation, and metrics collection. Track requests from your firewall through proxies to applications and back.

## 🎯 Key Features

### 1. **Full Distributed Tracing**
- Track requests across your entire stack
- Correlate logs with traces using trace IDs
- Visualize request flow in Grafana

### 2. **Multi-Source Log Collection**
- ✅ OPNsense firewall logs (via syslog)
- ✅ Nginx access/error logs with trace IDs
- ✅ Docker container logs
- ✅ Application logs via OTLP
- ✅ System logs

### 3. **OTLP Integration**
- Receive metrics, traces, and logs from applications
- Support for gRPC and HTTP protocols
- Automatic trace context propagation

### 4. **Metrics Collection**
- Scrape Prometheus exporters
- Extract metrics from logs
- Remote write to Prometheus

## 📚 Documentation

- **[DISTRIBUTED_TRACING.md](DISTRIBUTED_TRACING.md)** - Complete guide for end-to-end request tracking
- **[OPNSENSE_SETUP.md](OPNSENSE_SETUP.md)** - Configure OPNsense firewall logging
- **[nginx-otel-example.conf](nginx-otel-example.conf)** - Nginx configuration with OpenTelemetry
- **[otel-nginx.toml](otel-nginx.toml)** - OpenTelemetry settings for Nginx

## 🚀 Quick Start

### 1. Start Services

```bash
# From the project root
docker-compose up -d

# Check Alloy is running
docker logs alloy

# Verify OTLP receivers are listening
curl http://localhost:12345/metrics | grep otelcol_receiver
```

### 2. Configure Data Sources

#### OPNsense Firewall
See [OPNSENSE_SETUP.md](OPNSENSE_SETUP.md) for detailed instructions.

**Quick Setup**:
- OPNsense → System → Settings → Logging / Targets
- Add remote target: `<alloy-server-ip>:5514`

#### Nginx Proxy
See [DISTRIBUTED_TRACING.md](DISTRIBUTED_TRACING.md#step-2-configure-nginx-with-opentelemetry) for detailed instructions.

**Quick Setup**:
```bash
# Install OpenTelemetry module
apt-get install libnginx-mod-http-opentelemetry

# Copy example configs
cp alloy/nginx-otel-example.conf /etc/nginx/nginx.conf
cp alloy/otel-nginx.toml /etc/nginx/otel-nginx.toml

# Update Alloy server address in otel-nginx.toml
sed -i 's/host = "alloy"/host = "<alloy-ip>"/' /etc/nginx/otel-nginx.toml

# Test and reload
nginx -t && nginx -s reload
```

#### Application Instrumentation
See [DISTRIBUTED_TRACING.md](DISTRIBUTED_TRACING.md#step-3-instrument-your-web-applications) for examples in Python, Node.js, and Go.

**Python Quick Example**:
```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

provider = TracerProvider()
provider.add_span_processor(
    BatchSpanProcessor(
        OTLPSpanExporter(endpoint="http://alloy:4318")
    )
)
trace.set_tracer_provider(provider)
```

## 📊 Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Request Journey                           │
└─────────────────────────────────────────────────────────────────┘

Client → OPNsense → Nginx → Web App → Backend → Database
         │          │        │         │
         │          │        │         └─── OTLP Traces (4318)
         │          │        └───────────── OTLP Traces (4318)
         │          └────────────────────── Access Logs + Traces
         └───────────────────────────────── Syslog (5514)

                           │
                           ▼
                    ┌─────────────┐
                    │    Alloy    │
                    │  (Collect,  │
                    │   Process,  │
                    │   Route)    │
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
    ┌────────┐        ┌────────┐       ┌──────────┐
    │  Loki  │        │ Tempo  │       │Prometheus│
    │ (Logs) │        │(Traces)│       │(Metrics) │
    └───┬────┘        └───┬────┘       └────┬─────┘
        │                 │                  │
        └─────────────────┴──────────────────┘
                          │
                          ▼
                    ┌──────────┐
                    │ Grafana  │
                    │ (Unified │
                    │   View)  │
                    └──────────┘
```

## 🔌 Endpoints & Ports

| Service | Port | Protocol | Purpose |
|---------|------|----------|---------|
| Alloy | **12345** | HTTP | Alloy UI & metrics endpoint |
| Alloy | **4318** | gRPC | OTLP receiver (metrics, traces, logs) |
| Alloy | **4319** | HTTP | OTLP receiver (metrics, traces, logs) |
| Alloy | **5140** | TCP/UDP | OTLP Syslog receiver |
| Alloy | **5514** | TCP/UDP | Loki Syslog receiver (OPNsense) |
| Prometheus | 9090 | HTTP | Prometheus API & UI |
| Loki | 3100 | HTTP | Loki API |
| Tempo | 3200 | HTTP | Tempo API |
| Tempo | 4317 | gRPC | Tempo OTLP receiver |
| Grafana | 3000 | HTTP | Grafana UI |

## 📈 What's Configured

### OTLP Receivers
- **gRPC (4318)**: Receives OpenTelemetry data from applications
- **HTTP (4319)**: Alternative HTTP endpoint for OTLP data
- **Syslog (5140)**: Receives syslog-formatted OTLP data

### Log Sources
1. **OPNsense Firewall** (syslog:5514)
   - Firewall pass/block decisions
   - Connection metadata
   - Source/destination IPs and ports

2. **Nginx Access Logs** (file:/var/log/nginx/)
   - JSON-formatted with trace IDs
   - Request/response details
   - Upstream timing

3. **Docker Containers** (docker.sock)
   - All container stdout/stderr
   - Automatic trace ID extraction from JSON logs

4. **System Logs** (file:/var/log/)
   - syslog, kern.log

### Trace Processing
- **Tail Sampling**: Keep 100% of errors, 100% of slow traces (>1s), 10% of normal traces
- **Resource Detection**: Automatically add host, docker, and environment metadata
- **Batch Processing**: Efficient batching for performance

### Metrics Collection
- **Prometheus Scraping**:
  - AdGuard exporter (9617)
  - Nginx exporter (9113)
  - PostgreSQL exporter (9187)
  - Proxmox exporter (9221)
  - Prometheus itself (9090)
  - Alloy metrics (12345)
  - Host system metrics (unix exporter)

- **Derived Metrics from Logs**:
  - `nginx_requests_total` - Counter of nginx requests
  - `nginx_request_duration_seconds` - Histogram of request durations
  - `opnsense_packets_total` - Counter of firewall packets

### Exporters
- **Prometheus**: Remote write to Prometheus (9090)
- **Tempo**: OTLP export to Tempo (4317)
- **Loki**: Log push to Loki (3100)

## 🔍 Viewing Your Data

### Grafana Explore

**1. View Traces** (Tempo):
```
Data Source: Tempo
Query Type: Search
```
- Search by trace ID
- Filter by service name
- View request waterfall

**2. View Logs** (Loki):
```logql
# All nginx access logs
{job="nginx-access"}

# Logs for a specific trace
{job=~"nginx-access|opnsense"} | json | trace_id="abc123"

# Firewall blocks to your web server
{job="opnsense"} | regexp ",block," | regexp "dst_port=80|443"

# Application errors
{job="containers"} | json | level="error"
```

**3. View Metrics** (Prometheus):
```promql
# Request rate by status
rate(nginx_requests_total[5m])

# 99th percentile latency
histogram_quantile(0.99, 
  rate(nginx_request_duration_seconds_bucket[5m])
)

# Firewall packet rate
rate(opnsense_packets_total[5m])
```

### Correlation Example

**Find everything about a request**:

1. **Start with a trace** in Tempo
2. **Copy trace_id** from span details
3. **Search logs** in Loki:
   ```logql
   {job=~"nginx-access|containers|opnsense"} 
   | json 
   | trace_id="<your-trace-id>"
   ```
4. **View metrics** for that time range:
   ```promql
   nginx_request_duration_seconds{trace_id="<your-trace-id>"}
   ```

## 🛠️ Configuration Files

### Main Config
- **`config.alloy`** - Main Alloy configuration with all pipelines

### Example Configs
- **`nginx-otel-example.conf`** - Nginx with OpenTelemetry module
- **`otel-nginx.toml`** - OpenTelemetry exporter settings for Nginx

### Guides
- **`DISTRIBUTED_TRACING.md`** - Complete distributed tracing setup
- **`OPNSENSE_SETUP.md`** - OPNsense configuration guide

## 🔧 Customization

### Adjust Sampling Rate

Edit `config.alloy`:
```hcl
otelcol.processor.tail_sampling "default" {
  policy {
    name = "probabilistic"
    type = "probabilistic"
    probabilistic {
      sampling_percentage = 10  # Change this value
    }
  }
}
```

### Add Custom Log Sources

```hcl
loki.source.file "custom" {
  targets = [
    {__path__ = "/path/to/your/log.log", job = "custom-app"},
  ]
  forward_to = [loki.write.default.receiver]
}
```

### Add Custom Metrics Scraping

```hcl
prometheus.scrape "custom" {
  targets = [{
    __address__ = "custom-exporter:9999",
  }]
  forward_to = [prometheus.remote_write.default.receiver]
  scrape_interval = "10s"
}
```

### Reload Configuration

```bash
# Restart Alloy
docker-compose restart alloy

# Or reload without restart (if enabled)
curl -X POST http://localhost:12345/-/reload
```

## 🐛 Troubleshooting

### Alloy Not Starting

```bash
# Check logs
docker logs alloy

# Verify config syntax
docker exec alloy alloy fmt /etc/alloy/config.alloy
```

### No Traces Appearing

1. **Verify OTLP endpoint**:
   ```bash
   curl http://localhost:4318
   # Should return: method not allowed (endpoint exists)
   ```

2. **Check Tempo connection**:
   ```bash
   docker exec alloy ping tempo
   ```

3. **Enable debug logging**:
   Add to application:
   ```python
   from opentelemetry.sdk.trace.export import ConsoleSpanExporter
   ```

### No Firewall Logs

1. **Test syslog connection**:
   ```bash
   echo "test" | nc -u <alloy-ip> 5514
   docker logs alloy | grep "test"
   ```

2. **Check OPNsense config**:
   - System → Log Files → General
   - Look for remote logging status

3. **Verify firewall rule** allows outbound to port 5514

### Nginx Logs Not Parsed

1. **Check log format is JSON**:
   ```bash
   tail -f /var/log/nginx/access-json.log | jq
   ```

2. **Verify Alloy can read the file**:
   ```bash
   docker exec alloy cat /var/log/nginx/access-json.log
   ```

3. **Check Alloy log processing**:
   ```bash
   docker logs alloy | grep nginx
   ```

## 📊 Example Grafana Dashboards

### Request Flow Dashboard

**Panel 1: Trace View**
- Visualization: Trace
- Data source: Tempo
- Shows full request waterfall

**Panel 2: Correlated Logs**
- Visualization: Logs
- Data source: Loki
- Query: `{job=~"nginx-access|opnsense"} | json | trace_id="$trace_id"`

**Panel 3: Metrics Timeline**
- Visualization: Graph
- Data source: Prometheus
- Query: `rate(nginx_request_duration_seconds_sum[1m])`

### Firewall Overview

```promql
# Packet rate
rate(opnsense_packets_total[5m])

# Top source IPs
topk(10, sum by(src_ip)(rate(opnsense_packets_total[5m])))

# Blocked vs allowed
sum by(action)(rate(opnsense_packets_total[5m]))
```

## 🎓 Next Steps

1. ✅ **Basic Setup**: Get Alloy running and receiving OTLP data
2. 📝 **Configure OPNsense**: Follow [OPNSENSE_SETUP.md](OPNSENSE_SETUP.md)
3. 🌐 **Set up Nginx**: Follow [DISTRIBUTED_TRACING.md](DISTRIBUTED_TRACING.md#step-2-configure-nginx-with-opentelemetry)
4. 🔧 **Instrument Apps**: Add OpenTelemetry to your applications
5. 📊 **Create Dashboards**: Build visualization in Grafana
6. 🔔 **Set Alerts**: Configure alerting for errors and slow requests
7. 📈 **Optimize**: Tune sampling rates and retention

## 🔗 Useful Links

- [Grafana Alloy Documentation](https://grafana.com/docs/alloy/)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [W3C Trace Context Specification](https://www.w3.org/TR/trace-context/)
- [Nginx OpenTelemetry Module](https://github.com/open-telemetry/opentelemetry-cpp-contrib/tree/main/instrumentation/nginx)
- [OPNsense Documentation](https://docs.opnsense.org/)

## 💡 Tips

- **Start small**: Begin with application tracing, then add logs, then firewall
- **Use consistent service names**: Makes correlation easier
- **Add custom attributes**: User IDs, order IDs, feature flags
- **Monitor Alloy itself**: Watch for dropped spans or log backpressure
- **Tune sampling**: Balance observability vs. cost/performance
- **Use structured logging**: JSON logs are easier to parse and search

Happy observing! 🚀
