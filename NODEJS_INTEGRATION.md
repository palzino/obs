# Node.js OpenTelemetry Integration Guide

## Overview

This guide explains how to integrate a Node.js application with your existing Grafana observability stack using OpenTelemetry auto-instrumentation.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Node.js Application                      │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  @opentelemetry/auto-instrumentations-node          │   │
│  │  • HTTP/HTTPS instrumentation                        │   │
│  │  • Express instrumentation                           │   │
│  │  • DNS, Net, FS instrumentation                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                   │
│                          ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         OpenTelemetry SDK                            │   │
│  │  • Trace Exporter (OTLP/gRPC)                       │   │
│  │  • Metric Exporter (OTLP/gRPC)                      │   │
│  │  • Log Exporter (OTLP/gRPC)                         │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────────────┬───────────────────────────────────┘
                          │
                          │ OTLP/gRPC
                          │ Port 4318
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Grafana Alloy (192.168.0.243)                  │
│                                                              │
│  ┌──────────────────┐                                       │
│  │  OTLP Receiver   │                                       │
│  │  gRPC: 4318      │                                       │
│  │  HTTP: 4319      │                                       │
│  └────────┬─────────┘                                       │
│           │                                                  │
│           ▼                                                  │
│  ┌──────────────────┐                                       │
│  │ Batch Processor  │                                       │
│  └────────┬─────────┘                                       │
│           │                                                  │
│      ┌────┴────┬──────────┐                                │
│      ▼         ▼          ▼                                 │
│  ┌──────┐ ┌──────┐ ┌─────────────┐                        │
│  │Metrics│ │Logs  │ │Tail Sampling│                        │
│  └───┬──┘ └──┬───┘ └──────┬──────┘                        │
└──────┼───────┼────────────┼────────────────────────────────┘
       │       │            │
       ▼       ▼            ▼
   ┌────────┐ ┌────┐ ┌──────────┐
   │Promethe│ │Loki│ │  Tempo   │
   │us      │ │    │ │          │
   │:9090   │ │3100│ │  :4317   │
   └────┬───┘ └──┬─┘ └────┬─────┘
        │        │        │
        └────────┴────────┘
                 │
                 ▼
          ┌─────────────┐
          │   Grafana   │
          │    :3000    │
          └─────────────┘
```

## What's Included

### 📁 Files Created

```
nodejs-example/
├── package.json              # Dependencies
├── package-lock.json         # Lock file
├── tracing.js                # OpenTelemetry configuration
├── logger.js                 # Winston logger with trace correlation
├── app.js                    # Sample Express application
├── Dockerfile                # Docker image
├── docker-compose.yml        # Docker Compose config
├── test-load.sh              # Load testing script
├── .gitignore               # Git ignore rules
├── README.md                 # Full documentation
└── QUICKSTART.md            # Quick start guide
```

### 🎯 Key Features

#### 1. **Auto-Instrumentation**
- ✅ Automatic HTTP request/response tracking
- ✅ Express route and middleware instrumentation
- ✅ Error detection and recording
- ✅ Performance metrics collection
- ✅ No code changes required for basic instrumentation

#### 2. **Distributed Tracing**
- ✅ Full trace context propagation
- ✅ Parent-child span relationships
- ✅ Custom span creation
- ✅ Intelligent tail sampling:
  - 100% of error traces
  - 100% of slow traces (>1s)
  - 10% of normal traces

#### 3. **Metrics**
- ✅ HTTP request duration histograms
- ✅ Request count metrics
- ✅ Custom business metrics
- ✅ Automatic metric aggregation

#### 4. **Structured Logging**
- ✅ JSON formatted logs
- ✅ Automatic trace_id injection
- ✅ Automatic span_id injection
- ✅ Correlation with traces in Grafana

## Telemetry Data Flow

### 1. **Traces Flow**
```
Node.js App
  → OTLP Exporter (gRPC:4318)
  → Alloy OTLP Receiver
  → Batch Processor
  → Tail Sampling Processor
  → OTLP Exporter
  → Tempo (gRPC:4317)
  → Grafana (Explore → Tempo)
```

### 2. **Metrics Flow**
```
Node.js App
  → OTLP Exporter (gRPC:4318)
  → Alloy OTLP Receiver
  → Batch Processor
  → Prometheus Exporter
  → Prometheus Remote Write (HTTP:9090)
  → Grafana (Explore → Prometheus)
```

### 3. **Logs Flow**
```
Node.js App
  → OTLP Exporter (gRPC:4318)
  → Alloy OTLP Receiver
  → Batch Processor
  → Loki Exporter
  → Loki (HTTP:3100)
  → Grafana (Explore → Loki)
```

## Quick Start

### Method 1: NPM (Recommended for Development)

```bash
cd nodejs-example
npm install
npm start
```

### Method 2: Docker

```bash
cd nodejs-example
docker build -t nodejs-otel-app .
docker run -d -p 3001:3001 \
  -e OTEL_EXPORTER_OTLP_ENDPOINT=192.168.0.243:4318 \
  nodejs-otel-app
```

### Method 3: Docker Compose

```bash
cd nodejs-example
docker-compose up -d
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `192.168.0.243:4318` | Alloy gRPC endpoint |
| `OTEL_SERVICE_NAME` | `nodejs-app` | Service identifier |
| `OTEL_SERVICE_VERSION` | `1.0.0` | Service version |
| `PORT` | `3001` | Application port |
| `LOG_LEVEL` | `info` | Logging level |
| `NODE_ENV` | `development` | Environment |

### Alloy Endpoints

Your Alloy instance at `192.168.0.243` exposes:

| Protocol | Port | Purpose |
|----------|------|---------|
| gRPC | 4318 | OTLP receiver (metrics, traces, logs) |
| HTTP | 4319 | OTLP receiver (metrics, traces, logs) |
| HTTP | 12345 | Alloy UI and metrics |
| TCP/UDP | 5514 | Syslog receiver (OPNsense) |

## Testing the Integration

### 1. Start the Application

```bash
cd nodejs-example
npm start
```

Expected output:
```
🔧 Configuring OpenTelemetry for service: nodejs-app
📡 OTLP Endpoint: 192.168.0.243:4318
✅ OpenTelemetry tracing initialized successfully
🚀 Server running at http://localhost:3001
```

### 2. Generate Telemetry Data

```bash
# Manual test
curl http://localhost:3001/api/hello?name=Test

# Automated load test
./test-load.sh
```

### 3. View in Grafana

Access Grafana at: `http://192.168.0.243:3000`

#### Traces (Tempo)
```
Navigate: Explore → Tempo
Query: service.name="nodejs-app"
```

#### Metrics (Prometheus)
```
Navigate: Explore → Prometheus
Query: {job="nodejs-app"}
Query: rate(http_server_duration_count[5m])
```

#### Logs (Loki)
```
Navigate: Explore → Loki
Query: {service="nodejs-app"}
Query: {service="nodejs-app"} |= "error"
```

## Trace Correlation Example

1. **Make a request:**
   ```bash
   curl http://localhost:3001/api/hello?name=Alice
   ```

2. **Check logs in Loki:**
   ```
   {service="nodejs-app"} |= "Alice"
   ```

3. **Click on `trace_id` field in the log**

4. **Grafana automatically jumps to the trace in Tempo!** ✨

## Sample Endpoints

The example app includes these endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/hello?name=X` | Hello with custom span |
| GET | `/api/error` | Trigger error (100% sampled) |
| GET | `/api/slow?duration=X` | Slow request (>1s sampled) |
| POST | `/api/data` | Submit data with metrics |

## Integrating with Your App

### Step 1: Install Dependencies

```bash
npm install @opentelemetry/api \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/sdk-node \
  @opentelemetry/exporter-trace-otlp-grpc \
  @opentelemetry/exporter-metrics-otlp-grpc \
  @opentelemetry/exporter-logs-otlp-grpc \
  @opentelemetry/sdk-logs \
  winston
```

### Step 2: Copy Configuration Files

```bash
# Copy tracing configuration
cp nodejs-example/tracing.js your-app/

# Copy logger (optional but recommended)
cp nodejs-example/logger.js your-app/
```

### Step 3: Update package.json

```json
{
  "scripts": {
    "start": "node --require ./tracing.js your-app.js"
  }
}
```

### Step 4: Set Environment Variables

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=192.168.0.243:4318
export OTEL_SERVICE_NAME=your-service-name
```

### Step 5: Run Your App

```bash
npm start
```

That's it! Your app now sends telemetry to Alloy automatically! 🎉

## Verification Checklist

- [ ] OpenTelemetry initialization message appears in logs
- [ ] Network connectivity to `192.168.0.243:4318` is confirmed
- [ ] Alloy UI (`http://192.168.0.243:12345`) shows incoming OTLP data
- [ ] Traces appear in Grafana → Tempo
- [ ] Metrics appear in Grafana → Prometheus
- [ ] Logs appear in Grafana → Loki
- [ ] Logs include `trace_id` field
- [ ] Clicking `trace_id` navigates to trace

## Troubleshooting

### Issue: No data in Grafana

**Solution 1: Check network connectivity**
```bash
nc -zv 192.168.0.243 4318
```

**Solution 2: Verify Alloy is receiving data**
```bash
curl http://192.168.0.243:12345/metrics | grep otelcol_receiver
```

**Solution 3: Check app logs**
```bash
# Should see initialization message
npm start
```

### Issue: Traces not showing

**Solution: Generate traffic and wait**
```bash
./test-load.sh
# Wait 10-15 seconds for tail sampling decision
```

### Issue: High resource usage

**Solution: Reduce export frequency**

Edit `tracing.js`:
```javascript
exportIntervalMillis: 10000, // Increase from 5000
```

Disable verbose instrumentations:
```javascript
'@opentelemetry/instrumentation-fs': {
  enabled: false,
},
```

## Advanced Customization

### Custom Spans

```javascript
const api = require('@opentelemetry/api');
const tracer = api.trace.getTracer('my-service');

const span = tracer.startSpan('custom-operation');
span.setAttribute('user.id', userId);
span.setAttribute('order.total', orderTotal);

try {
  // Your code here
  span.setStatus({ code: api.SpanStatusCode.OK });
} catch (error) {
  span.recordException(error);
  span.setStatus({ 
    code: api.SpanStatusCode.ERROR,
    message: error.message 
  });
} finally {
  span.end();
}
```

### Custom Metrics

```javascript
const api = require('@opentelemetry/api');
const meter = api.metrics.getMeter('my-service');

// Counter
const orderCounter = meter.createCounter('orders_total');
orderCounter.add(1, { status: 'completed' });

// Histogram
const orderValue = meter.createHistogram('order_value');
orderValue.record(123.45, { currency: 'USD' });
```

### Custom Logs with Trace Context

```javascript
const logger = require('./logger');

// Automatically includes trace_id and span_id
logger.info('User logged in', { userId: 123 });
logger.error('Payment failed', { orderId: 456, error: err.message });
```

## Benefits

✅ **Zero Code Changes** - Auto-instrumentation works out of the box

✅ **Full Observability** - Traces, metrics, and logs in one place

✅ **Trace Correlation** - Click from logs to traces seamlessly

✅ **Intelligent Sampling** - Keep all errors and slow requests

✅ **Production Ready** - Battle-tested OpenTelemetry SDKs

✅ **Vendor Neutral** - Standard OTLP protocol

✅ **Grafana Integration** - Works with your existing stack

## Next Steps

1. ✅ Review the example app in `nodejs-example/`
2. ✅ Run `npm start` and test endpoints
3. ✅ Execute `./test-load.sh` to generate data
4. ✅ View telemetry in Grafana
5. ✅ Copy `tracing.js` to your app
6. ✅ Update your `package.json` start script
7. ✅ Deploy with confidence!

## Resources

- [Full README](nodejs-example/README.md)
- [Quick Start Guide](nodejs-example/QUICKSTART.md)
- [OpenTelemetry Node.js Docs](https://opentelemetry.io/docs/instrumentation/js/)
- [Grafana Alloy Docs](https://grafana.com/docs/alloy/)

---

**Need Help?** Check the example app logs, verify network connectivity, and ensure Alloy is running at `192.168.0.243:4318`.

