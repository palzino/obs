# Python OpenTelemetry Test Application

A Python Flask application with OpenTelemetry auto-instrumentation that sends telemetry data (traces, metrics, and logs) to Grafana Alloy.

## Features

- **Distributed Tracing** - Automatic HTTP instrumentation with custom spans
- **Metrics** - Custom counters and histograms
- **Structured Logging** - Logs with trace correlation
- **Error Handling** - Automatic error tracking and recording
- **Performance Monitoring** - Request duration and throughput metrics

## Quick Start

### 1. Install Dependencies

```bash
cd python-test-app
pip install -r requirements.txt
```

### 2. Run the Application

```bash
python main.py
```

The application will start on port 3002 and automatically send telemetry data to Alloy.

### 3. Test the Application

```bash
# Manual testing
curl http://localhost:3002/health
curl http://localhost:3002/api/hello?name=PythonUser

# Automated load test
python test-load.py
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `192.168.0.243:4319` | Alloy HTTP endpoint |
| `OTEL_SERVICE_NAME` | `python-app` | Service identifier |
| `OTEL_SERVICE_VERSION` | `1.0.0` | Service version |
| `PORT` | `3002` | Application port |
| `NODE_ENV` | `development` | Environment |

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/hello?name=X` | Hello with custom span |
| GET | `/api/error` | Trigger error (100% sampled) |
| GET | `/api/slow?duration=X` | Slow request (>1s sampled) |
| POST | `/api/data` | Submit data with metrics |
| GET | `/api/random` | Random data with metrics |

## Telemetry Data

### Traces
- HTTP request/response spans
- Custom operation spans
- Error tracking and stack traces
- Automatic trace context propagation

### Metrics
- `python_requests_total` - Request counter
- `python_request_duration_seconds` - Request duration histogram
- `python_data_submissions_total` - Data submission counter

### Logs
- Structured JSON logs
- Automatic trace correlation
- Error logging with context
- Performance logging

## Viewing Data in Grafana

### Traces (Tempo)
- Navigate to: **Explore → Tempo**
- Query: `service.name="python-app"`

### Metrics (Prometheus)
- Navigate to: **Explore → Prometheus**
- Query: `{service_name="python-app"}`
- Query: `python_requests_total`
- Query: `rate(python_request_duration_seconds_count[5m])`

### Logs (Loki)
- Navigate to: **Explore → Loki**
- Query: `{service="python-app"}`
- Query: `{service="python-app"} |= "error"`

## Architecture

```
Python App → OTLP/HTTP → Alloy (192.168.0.243:4319) → 
  ├─→ Tempo (traces)
  ├─→ Prometheus (metrics)  
  └─→ Loki (logs)
    → Grafana Dashboard
```

## Comparison with Node.js App

| Feature | Node.js | Python |
|---------|---------|--------|
| **Port** | 3001 | 3002 |
| **Service Name** | nodejs-app | python-app |
| **Protocol** | gRPC (4318) | HTTP (4319) |
| **Auto-instrumentation** | ✅ | ✅ |
| **Custom Metrics** | ✅ | ✅ |
| **Structured Logs** | ✅ | ✅ |
| **Error Tracking** | ✅ | ✅ |

## Troubleshooting

### No data in Grafana
1. Check if Alloy is receiving data:
   ```bash
   curl http://192.168.0.243:12345/metrics | grep otelcol_receiver_accepted
   ```

2. Verify network connectivity:
   ```bash
   nc -zv 192.168.0.243 4319
   ```

3. Check application logs for OpenTelemetry initialization errors

### Logs not showing
- Ensure the app is using the OpenTelemetry logging handler
- Check if logs are being sent via OTLP HTTP endpoint
- Verify Loki is receiving data from Alloy

## Development

### Adding Custom Metrics
```python
# Create a custom counter
custom_counter = meter.create_counter(
    name="my_custom_metric",
    description="My custom metric description",
)

# Record a value
custom_counter.add(1, {"label": "value"})
```

### Adding Custom Spans
```python
with tracer.start_as_current_span("my-operation") as span:
    span.set_attribute("custom.attribute", "value")
    # Your code here
    span.set_attribute("result", "success")
```

### Adding Structured Logs
```python
logger.info("Operation completed", extra={
    "operation": "my-operation",
    "duration": 1.23,
    "status": "success"
})
```

## Resources

- [OpenTelemetry Python Documentation](https://opentelemetry.io/docs/instrumentation/python/)
- [Flask Instrumentation](https://opentelemetry.io/docs/instrumentation/python/libraries/flask/)
- [Grafana Alloy Documentation](https://grafana.com/docs/alloy/latest/)
