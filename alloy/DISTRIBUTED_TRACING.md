# Distributed Tracing Setup - Request Flow Tracking

This guide explains how to track requests from OPNsense firewall → Nginx proxy → Web app → Backend services and back.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Request Flow                                │
└─────────────────────────────────────────────────────────────────────┘

  1. Client Request
     │
     ▼
  ┌─────────────────┐
  │  OPNsense FW    │ ─────┐ Syslog (5514)
  │  (Firewall)     │      │
  └────────┬────────┘      │
           │                │
           ▼                │
  ┌─────────────────┐      │
  │  Nginx Proxy    │ ─────┤ Access Logs + Trace Headers
  │  + OTEL Module  │      │
  └────────┬────────┘      │
           │                │
           ▼                │
  ┌─────────────────┐      │
  │   Web App       │ ─────┤ OTLP Traces (4318)
  │ (Instrumented)  │      │
  └────────┬────────┘      │
           │                │
           ▼                │
  ┌─────────────────┐      │
  │  Backend APIs   │ ─────┘ OTLP Traces (4318)
  │ (Instrumented)  │
  └─────────────────┘
           │
           │
           ▼
     ┌──────────┐
     │  Alloy   │
     └─────┬────┘
           │
    ┌──────┴──────┬──────────┐
    │             │          │
    ▼             ▼          ▼
┌───────┐    ┌────────┐  ┌──────┐
│ Loki  │    │ Tempo  │  │Prom. │
│ (Logs)│    │(Traces)│  │(Metr)│
└───┬───┘    └───┬────┘  └──┬───┘
    │            │          │
    └────────────┴──────────┘
                 │
                 ▼
            ┌─────────┐
            │ Grafana │
            └─────────┘
```

## Key Concept: W3C Trace Context

The magic ingredient is **W3C Trace Context** headers that propagate through your stack:

- `traceparent: 00-{trace_id}-{span_id}-{flags}`
- `tracestate: {vendor-specific}`

When properly configured, the same `trace_id` flows through:
1. OPNsense logs (via connection tracking)
2. Nginx access logs (via headers)
3. Application spans (via OTLP)
4. Downstream service spans (via header propagation)

---

## Step 1: Configure OPNsense Firewall

### Enable Remote Logging

1. **Login to OPNsense** web interface
2. **System → Settings → Logging / Targets**
3. **Add Remote Logging Target**:
   - **Enable**: ✓
   - **Transport**: TCP or UDP
   - **Applications**: firewall, web proxy (if using)
   - **Levels**: Informational and above
   - **Hostname**: `<your-alloy-server-ip>`
   - **Port**: `5514`
   - **Description**: Alloy Log Collector

### Format Logs (Optional - for better parsing)

OPNsense → **Firewall → Log Files → Settings**
- **Log Format**: Select detailed format including src/dst IPs and ports

### Test Connection

```bash
# From OPNsense shell
echo "test message" | nc <alloy-server-ip> 5514
```

---

## Step 2: Configure Nginx with OpenTelemetry

You have **two options** for Nginx:

### Option A: Nginx + OpenTelemetry Module (Recommended)

This automatically creates spans and propagates trace context.

#### Install nginx-otel module

```bash
# For Ubuntu/Debian
apt-get install libnginx-mod-http-opentelemetry

# For Alpine
apk add nginx-mod-http-opentelemetry

# For Docker - use base image with module
FROM nginx:latest
# Install otel module...
```

#### Nginx Configuration

```nginx
# /etc/nginx/nginx.conf

load_module modules/ngx_http_opentelemetry_module.so;

http {
    # OpenTelemetry configuration
    opentelemetry_config /etc/nginx/otel-nginx.toml;
    
    # Enable tracing
    opentelemetry on;
    opentelemetry_operation_name "nginx_proxy";
    opentelemetry_trust_incoming_spans on;
    
    # Propagate trace context to upstream
    opentelemetry_propagate;
    
    # JSON access log with trace IDs
    log_format json_combined escape=json '{'
        '"time":"$time_iso8601",'
        '"remote_addr":"$remote_addr",'
        '"request_id":"$request_id",'
        '"remote_user":"$remote_user",'
        '"method":"$request_method",'
        '"path":"$request_uri",'
        '"status":$status,'
        '"body_bytes_sent":$body_bytes_sent,'
        '"request_time":$request_time,'
        '"http_referer":"$http_referer",'
        '"http_user_agent":"$http_user_agent",'
        '"trace_id":"$opentelemetry_trace_id",'
        '"span_id":"$opentelemetry_span_id"'
    '}';
    
    access_log /var/log/nginx/access-json.log json_combined;
    error_log /var/log/nginx/error.log warn;
    
    server {
        listen 80;
        server_name example.com;
        
        location / {
            # Pass trace context to backend
            proxy_set_header traceparent $opentelemetry_context_traceparent;
            proxy_set_header tracestate $opentelemetry_context_tracestate;
            
            proxy_pass http://backend:8080;
        }
    }
}
```

#### OpenTelemetry Configuration for Nginx

Create `/etc/nginx/otel-nginx.toml`:

```toml
exporter = "otlp"
processor = "batch"

[exporters.otlp]
host = "alloy"  # or your Alloy server IP
port = 4318

[processors.batch]
max_queue_size = 2048
schedule_delay_millis = 5000
max_export_batch_size = 512

[service]
name = "nginx-proxy"

[sampler]
name = "AlwaysOn"
```

### Option B: Nginx with JSON Logging (Simpler, No Auto-Tracing)

If you can't use the OpenTelemetry module, use JSON logging and extract trace IDs from headers:

```nginx
http {
    # Capture trace ID from incoming requests
    map $http_traceparent $trace_id {
        ~^00-([^-]+)- $1;
        default "";
    }
    
    # JSON access log format
    log_format json_combined escape=json '{'
        '"time":"$time_iso8601",'
        '"remote_addr":"$remote_addr",'
        '"method":"$request_method",'
        '"path":"$request_uri",'
        '"status":$status,'
        '"request_time":$request_time,'
        '"http_user_agent":"$http_user_agent",'
        '"trace_id":"$trace_id",'
        '"http_traceparent":"$http_traceparent"'
    '}';
    
    access_log /var/log/nginx/access-json.log json_combined;
    
    server {
        listen 80;
        
        location / {
            # Forward trace headers to backend
            proxy_set_header traceparent $http_traceparent;
            proxy_set_header tracestate $http_tracestate;
            
            proxy_pass http://backend:8080;
        }
    }
}
```

#### Mount Nginx Logs to Alloy

Add to your Alloy container volumes:

```yaml
volumes:
  - /var/log/nginx:/var/log/nginx:ro
```

---

## Step 3: Instrument Your Web Applications

### Python (Flask/FastAPI Example)

```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.flask import FlaskInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from opentelemetry.sdk.resources import Resource
from flask import Flask

# Configure OTLP exporter
resource = Resource(attributes={
    "service.name": "my-web-app",
    "service.version": "1.0.0",
    "environment": "production",
})

provider = TracerProvider(resource=resource)
processor = BatchSpanProcessor(
    OTLPSpanExporter(
        endpoint="http://alloy:4318",
        insecure=True
    )
)
provider.add_span_processor(processor)
trace.set_tracer_provider(provider)

# Create Flask app
app = Flask(__name__)

# Auto-instrument Flask (captures incoming requests)
FlaskInstrumentor().instrument_app(app)

# Auto-instrument requests library (captures outgoing HTTP calls)
RequestsInstrumentor().instrument()

@app.route("/api/users")
def get_users():
    # This will automatically be part of the trace
    import requests
    
    # This call will create a child span
    response = requests.get("http://user-service:8080/users")
    
    return response.json()

if __name__ == "__main__":
    app.run()
```

### Node.js (Express Example)

```javascript
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');

// Configure tracer
const provider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'my-node-app',
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
  }),
});

const exporter = new OTLPTraceExporter({
  url: 'http://alloy:4318',
});

provider.addSpanProcessor(new BatchSpanProcessor(exporter));
provider.register();

// Auto-instrument HTTP and Express
registerInstrumentations({
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
  ],
});

// Your Express app
const express = require('express');
const app = express();

app.get('/api/users', async (req, res) => {
  // Automatically traced
  const users = await fetchUsers();
  res.json(users);
});

app.listen(3000);
```

### Go Example

```go
package main

import (
    "context"
    "net/http"
    
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
    "go.opentelemetry.io/otel/sdk/resource"
    "go.opentelemetry.io/otel/sdk/trace"
    semconv "go.opentelemetry.io/otel/semconv/v1.4.0"
    "go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

func initTracer() func() {
    ctx := context.Background()
    
    res, _ := resource.New(ctx,
        resource.WithAttributes(
            semconv.ServiceNameKey.String("my-go-app"),
            semconv.ServiceVersionKey.String("1.0.0"),
        ),
    )
    
    exporter, _ := otlptracegrpc.New(ctx,
        otlptracegrpc.WithEndpoint("alloy:4318"),
        otlptracegrpc.WithInsecure(),
    )
    
    tp := trace.NewTracerProvider(
        trace.WithBatcher(exporter),
        trace.WithResource(res),
    )
    
    otel.SetTracerProvider(tp)
    
    return func() {
        tp.Shutdown(ctx)
    }
}

func main() {
    cleanup := initTracer()
    defer cleanup()
    
    // Wrap HTTP handler with OTEL
    http.Handle("/api/users", otelhttp.NewHandler(
        http.HandlerFunc(getUsersHandler),
        "GET /api/users",
    ))
    
    http.ListenAndServe(":8080", nil)
}

func getUsersHandler(w http.ResponseWriter, r *http.Request) {
    // Automatically traced, context propagates from Nginx
    w.Write([]byte("users"))
}
```

---

## Step 4: Verify End-to-End Tracing

### 1. Generate a Test Request

```bash
# Add trace headers to your request
curl -H "traceparent: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01" \
     http://your-nginx-server/api/test
```

### 2. Check Grafana

1. **Open Grafana**: http://localhost:3000
2. **Go to Explore**
3. **Select Tempo** as data source
4. **Search for trace ID**: `0af7651916cd43dd8448eb211c80319c`

You should see:
- Nginx proxy span
- Your web app span(s)
- Any downstream service spans

### 3. Correlate Logs

1. **Click on any span** in the trace
2. **Click "Logs for this span"**
3. You'll see:
   - Nginx access log for this request
   - Application logs with the same trace_id
   - OPNsense firewall logs (matched by IP/timestamp)

---

## Step 5: Grafana Dashboard for Full Request Flow

Create a dashboard that shows:

1. **Trace View** (Tempo)
   - Full request waterfall
   - Service dependencies
   - Error rates per service

2. **Logs Panel** (Loki)
   ```logql
   {job=~"nginx-access|opnsense"} 
   | json 
   | trace_id="<selected-from-trace>"
   ```

3. **Metrics Panel** (Prometheus)
   ```promql
   rate(nginx_request_duration_seconds_sum[5m])
   ```

---

## Connection Tracking Between Firewall and Nginx

Since OPNsense doesn't automatically know about trace IDs, we correlate by:

1. **Source IP + Destination Port + Timestamp**
2. **Connection Duration**
3. **Request/Response Sizes**

In Grafana, you can create a query that joins:
```logql
# Get firewall connections to your web server
{job="opnsense"} 
| json 
| dst_ip="<your-nginx-ip>" 
| dst_port="80"
| __timestamp__ >= <trace-start-time>
| __timestamp__ <= <trace-end-time>
```

---

## Example: Full Trace Flow

```
1. User hits: https://example.com/api/users

2. OPNsense sees connection:
   [2025-10-12 14:30:00] pass tcp 203.0.113.5:54321 -> 192.168.1.10:443
   
3. Nginx receives request and generates trace:
   {
     "time": "2025-10-12T14:30:00.123Z",
     "remote_addr": "203.0.113.5",
     "method": "GET",
     "path": "/api/users",
     "status": 200,
     "trace_id": "0af7651916cd43dd8448eb211c80319c",
     "span_id": "b7ad6b7169203331"
   }
   
4. Web app creates child spans:
   - Span: "GET /api/users" (parent)
     - Span: "SELECT * FROM users" (database query)
     - Span: "POST /validate" (external API call)
   
5. All spans share trace_id: 0af7651916cd43dd8448eb211c80319c

6. In Grafana:
   - View trace → see full waterfall
   - Click span → see correlated logs
   - See firewall logs via IP/time correlation
```

---

## Best Practices

### 1. Sampling Strategy
- **Production**: Sample 1-10% of normal requests
- **Always Keep**: Errors, slow requests (>1s)
- **Development**: 100% sampling

### 2. Add Custom Attributes
```python
from opentelemetry import trace

span = trace.get_current_span()
span.set_attribute("user.id", user_id)
span.set_attribute("order.id", order_id)
span.set_attribute("feature.flag", "new_checkout")
```

### 3. Structured Logging with Trace Context
```python
import logging
from opentelemetry import trace

def get_trace_context():
    span = trace.get_current_span()
    if span:
        ctx = span.get_span_context()
        return {
            "trace_id": format(ctx.trace_id, '032x'),
            "span_id": format(ctx.span_id, '016x'),
        }
    return {}

# Log with trace context
logger.info("Processing order", extra=get_trace_context())
```

### 4. Service Mesh (Optional - Advanced)
Consider using Istio or Linkerd for automatic trace propagation at the network level.

---

## Troubleshooting

### Traces not connecting

1. **Check trace context propagation**:
   ```bash
   curl -v http://nginx-server/test
   # Look for traceparent header in response
   ```

2. **Verify OTLP endpoint**:
   ```bash
   docker logs alloy | grep -i otlp
   ```

3. **Check application is sending spans**:
   ```python
   # Add debug logging
   from opentelemetry.sdk.trace.export import ConsoleSpanExporter
   provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
   ```

### Firewall logs not appearing

1. **Test syslog connectivity**:
   ```bash
   echo "test" | nc -u alloy-server 5514
   docker logs alloy | grep "test"
   ```

2. **Check OPNsense logs**:
   System → Log Files → General → check if remote logging is active

### Nginx logs missing trace IDs

1. **Verify OpenTelemetry module is loaded**:
   ```bash
   nginx -V 2>&1 | grep opentelemetry
   ```

2. **Check log format is JSON**:
   ```bash
   tail -f /var/log/nginx/access-json.log | jq
   ```

---

## Next Steps

1. ✅ Configure OPNsense remote logging
2. ✅ Set up Nginx with OpenTelemetry module
3. ✅ Instrument your applications
4. ✅ Test end-to-end tracing
5. 📊 Create Grafana dashboards
6. 🔔 Set up alerts for slow traces or errors
7. 📈 Analyze service dependencies and bottlenecks

Happy tracing! 🚀

