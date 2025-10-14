# Node.js OpenTelemetry Example

This is a sample Node.js application configured with OpenTelemetry auto-instrumentation to send telemetry data (traces, metrics, and logs) to Grafana Alloy.

## Prerequisites

- Node.js 16+ and npm
- Alloy instance running at `192.168.0.243` with OTLP receiver on port 4318

## Quick Start

1. **Install dependencies:**
   ```bash
   cd nodejs-example
   npm install
   ```

2. **Configure environment (optional):**
   ```bash
   cp .env.example .env
   # Edit .env if needed
   ```

3. **Run the application:**
   ```bash
   npm start
   ```

   The application will start on port 3001 and automatically send telemetry data to Alloy.

## What's Happening?

### Auto-Instrumentation
The `@opentelemetry/auto-instrumentations-node` package automatically instruments:
- **HTTP/HTTPS** - All incoming and outgoing requests
- **Express** - Route handlers and middleware
- **DNS** - DNS lookups
- **Net** - Network operations

### Telemetry Data Flow
```
Node.js App → OTLP (gRPC) → Alloy (192.168.0.243:4318) → Prometheus/Tempo/Loki → Grafana
```

### Data Types Exported

1. **Traces** (Distributed Tracing)
   - HTTP request/response spans
   - Custom spans with attributes
   - Error tracking and stack traces
   - Sent to Tempo via Alloy

2. **Metrics** (Performance Metrics)
   - HTTP request duration
   - Request counts
   - Custom metrics (counters, histograms)
   - Sent to Prometheus via Alloy

3. **Logs** (Structured Logging)
   - Application logs with trace correlation
   - Automatic trace_id and span_id injection
   - Sent to Loki via Alloy

## Testing Endpoints

### Health Check
```bash
curl http://localhost:3001/health
```

### Hello Endpoint (with custom span)
```bash
curl http://localhost:3001/api/hello?name=Alice
```

### Error Endpoint (generates error trace)
```bash
curl http://localhost:3001/api/error
```

### Slow Endpoint (for tail sampling)
```bash
# This will trigger slow trace sampling (>1s)
curl http://localhost:3001/api/slow?duration=2000
```

### Data Submission (with metrics)
```bash
curl -X POST http://localhost:3001/api/data \
  -H "Content-Type: application/json" \
  -d '{"value": 42}'
```

## Viewing Data in Grafana

1. **Access Grafana:** http://192.168.0.243:3000

2. **View Traces:**
   - Navigate to Explore → Tempo
   - Search by service: `nodejs-app`
   - View distributed traces with span details

3. **View Metrics:**
   - Navigate to Explore → Prometheus
   - Query: `{job="nodejs-app"}`
   - View HTTP metrics: `http_server_duration_bucket`

4. **View Logs:**
   - Navigate to Explore → Loki
   - Query: `{service="nodejs-app"}`
   - Click on trace_id to jump to related trace

## Trace Correlation

All logs include `trace_id` and `span_id` fields that correlate with traces:
- Logs → Click trace_id → View full trace in Tempo
- Traces → View related logs in Loki

## Configuration

### Environment Variables
- `OTEL_EXPORTER_OTLP_ENDPOINT` - Alloy endpoint (default: 192.168.0.243:4318)
- `OTEL_SERVICE_NAME` - Service name (default: nodejs-app)
- `OTEL_SERVICE_VERSION` - Service version (default: 1.0.0)
- `PORT` - Application port (default: 3001)
- `LOG_LEVEL` - Log level (default: info)

### Customizing Instrumentation

Edit `tracing.js` to customize:
- Add/remove auto-instrumentation packages
- Configure sampling
- Add custom resource attributes
- Modify export intervals

## Architecture

```
┌─────────────────┐
│   Node.js App   │
│                 │
│  • Express API  │
│  • Winston Logs │
│  • Custom Spans │
└────────┬────────┘
         │ OTLP/gRPC
         ▼
┌─────────────────┐
│     Alloy       │
│  192.168.0.243  │
│                 │
│  Port 4318      │
└────────┬────────┘
         │
    ┌────┴────┬────────┐
    ▼         ▼        ▼
┌────────┐ ┌──────┐ ┌──────┐
│Promethe│ │Tempo │ │Loki  │
│us      │ │      │ │      │
└────────┘ └──────┘ └──────┘
         │
         ▼
    ┌────────┐
    │Grafana │
    │  :3000 │
    └────────┘
```

## Troubleshooting

### No data in Grafana
1. Check Alloy is receiving data:
   - Visit Alloy UI: http://192.168.0.243:12345
   - Check for incoming OTLP data

2. Verify endpoint is accessible:
   ```bash
   telnet 192.168.0.243 4318
   ```

3. Check application logs for OpenTelemetry initialization errors

### Logs not correlated with traces
- Ensure you're using the provided `logger.js`
- Check that trace_id field is present in log output
- Verify Loki is configured to extract trace_id labels

### High cardinality warnings
- Reduce metric export interval in `tracing.js`
- Disable verbose instrumentations (e.g., fs)
- Implement sampling for high-traffic endpoints

