# Quick Start Guide

## 🚀 Getting Started in 3 Steps

### Step 1: Install Dependencies

```bash
cd nodejs-example
npm install
```

### Step 2: Set Environment Variables (Optional)

Create a `.env` file or export variables:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=192.168.0.243:4318
export OTEL_SERVICE_NAME=nodejs-app
export OTEL_SERVICE_VERSION=1.0.0
```

Or create `.env` file:
```bash
cat > .env << 'EOF'
OTEL_EXPORTER_OTLP_ENDPOINT=192.168.0.243:4318
OTEL_SERVICE_NAME=nodejs-app
OTEL_SERVICE_VERSION=1.0.0
PORT=3001
NODE_ENV=development
LOG_LEVEL=info
EOF
```

### Step 3: Run the Application

```bash
npm start
```

You should see:
```
🔧 Configuring OpenTelemetry for service: nodejs-app
📡 OTLP Endpoint: 192.168.0.243:4318
✅ OpenTelemetry tracing initialized successfully
🚀 Server running at http://localhost:3001
```

---

## 🧪 Test It Out

### Manual Testing

```bash
# Health check
curl http://localhost:3001/health

# Hello endpoint
curl http://localhost:3001/api/hello?name=Alice

# Slow request (triggers sampling)
curl http://localhost:3001/api/slow?duration=2000

# Error request (100% sampled)
curl http://localhost:3001/api/error

# Submit data with metrics
curl -X POST http://localhost:3001/api/data \
  -H "Content-Type: application/json" \
  -d '{"value": 42}'
```

### Automated Load Test

```bash
./test-load.sh
```

---

## 🐳 Running with Docker

### Build and Run

```bash
# Build the image
docker build -t nodejs-otel-app .

# Run the container
docker run -d \
  -p 3001:3001 \
  -e OTEL_EXPORTER_OTLP_ENDPOINT=192.168.0.243:4318 \
  -e OTEL_SERVICE_NAME=nodejs-app \
  --name nodejs-app \
  nodejs-otel-app

# View logs
docker logs -f nodejs-app
```

### Or use Docker Compose

```bash
docker-compose up -d
docker-compose logs -f
```

---

## 📊 View Data in Grafana

### 1. Access Grafana
Open http://192.168.0.243:3000

### 2. View Traces (Tempo)
- Navigate to **Explore** → **Tempo**
- Search by service: `service.name="nodejs-app"`
- View distributed traces with full span details
- See automatic HTTP instrumentation

### 3. View Metrics (Prometheus)
- Navigate to **Explore** → **Prometheus**
- Try these queries:
  ```promql
  # All metrics from nodejs-app
  {job="nodejs-app"}
  
  # HTTP request duration
  http_server_duration_bucket{service_name="nodejs-app"}
  
  # Request rate
  rate(http_server_duration_count[5m])
  
  # Custom metric
  data_submissions_total
  ```

### 4. View Logs (Loki)
- Navigate to **Explore** → **Loki**
- Query: `{service="nodejs-app"}`
- Look for `trace_id` field in logs
- Click on trace_id to jump to the related trace in Tempo!

### 5. Trace Correlation Demo

1. Make a request:
   ```bash
   curl http://localhost:3001/api/hello?name=TestUser
   ```

2. In Grafana Loki, search:
   ```
   {service="nodejs-app"} |= "TestUser"
   ```

3. Click the `trace_id` value in the log

4. Grafana will automatically jump to the trace in Tempo! ✨

---

## 🔍 Verify Telemetry Pipeline

### Check Alloy is Receiving Data

```bash
# Visit Alloy UI
open http://192.168.0.243:12345

# Or check with curl
curl http://192.168.0.243:12345/metrics | grep -i otlp
```

Look for metrics like:
- `otelcol_receiver_accepted_spans`
- `otelcol_receiver_accepted_metric_points`
- `otelcol_receiver_accepted_log_records`

### Verify Network Connectivity

```bash
# Test gRPC endpoint
nc -zv 192.168.0.243 4318

# Test HTTP endpoint  
nc -zv 192.168.0.243 4319
```

### Check Application Logs

The app logs will show trace context:
```
2024-01-15T10:30:45.123Z [info]: Hello endpoint called | trace_id=abc123... span_id=def456...
```

---

## 🎯 What You Get

### ✅ Automatic Instrumentation
- HTTP requests/responses
- Express routes and middleware
- Error tracking
- Performance metrics

### ✅ Distributed Tracing
- Full request traces
- Parent-child span relationships
- Error traces (100% sampled)
- Slow traces (100% sampled)
- Normal traces (10% sampled)

### ✅ Metrics
- Request duration histograms
- Request counts
- Custom business metrics
- HTTP status code tracking

### ✅ Structured Logs
- JSON formatted
- Automatic trace correlation
- trace_id and span_id in every log
- Searchable in Loki

### ✅ Full Observability Stack
```
Node.js → Alloy → Prometheus/Tempo/Loki → Grafana
```

---

## 🐛 Troubleshooting

### Problem: No data in Grafana

**Check 1: Is the app sending data?**
```bash
# Look for OpenTelemetry initialization message
npm start
# Should see: ✅ OpenTelemetry tracing initialized successfully
```

**Check 2: Can you reach Alloy?**
```bash
telnet 192.168.0.243 4318
# Should connect successfully
```

**Check 3: Is Alloy receiving data?**
```bash
curl http://192.168.0.243:12345/metrics | grep otelcol_receiver_accepted
```

**Check 4: Make some requests**
```bash
./test-load.sh
```

### Problem: Logs not showing trace_id

Make sure you're using the provided `logger.js`:
```javascript
const logger = require('./logger');
logger.info('This log will have trace_id');
```

### Problem: High CPU/Memory usage

Reduce export frequency in `tracing.js`:
```javascript
exportIntervalMillis: 10000, // Change from 5000 to 10000
```

Disable verbose instrumentations:
```javascript
'@opentelemetry/instrumentation-fs': {
  enabled: false,
},
```

---

## 🔧 Customization

### Change Service Name

```bash
export OTEL_SERVICE_NAME=my-custom-service
npm start
```

### Use HTTP instead of gRPC

Edit `tracing.js`:
```javascript
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

const traceExporter = new OTLPTraceExporter({
  url: `http://192.168.0.243:4319/v1/traces`,
});
```

### Add Custom Attributes

```javascript
const span = tracer.startSpan('my-operation');
span.setAttribute('user.id', userId);
span.setAttribute('order.value', orderTotal);
span.end();
```

### Create Custom Metrics

```javascript
const meter = api.metrics.getMeter('my-service');
const counter = meter.createCounter('my_metric');
counter.add(1, { label: 'value' });
```

---

## 📚 Next Steps

1. **Add to your existing app**: Copy `tracing.js` and `logger.js` to your project
2. **Install dependencies**: `npm install` the packages from `package.json`
3. **Update start script**: `"start": "node --require ./tracing.js your-app.js"`
4. **Set environment variables**: Point to your Alloy instance
5. **Deploy**: Your app will automatically send telemetry!

---

## 📖 Resources

- [OpenTelemetry Node.js Docs](https://opentelemetry.io/docs/instrumentation/js/getting-started/nodejs/)
- [Grafana Alloy Docs](https://grafana.com/docs/alloy/latest/)
- [OTLP Specification](https://opentelemetry.io/docs/specs/otlp/)

