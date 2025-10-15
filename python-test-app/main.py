#!/usr/bin/env python3
"""
Python OpenTelemetry Test Application
Uses opentelemetry-distro for auto-instrumentation with proper logging setup
"""

import os
import time
import random
import logging
from flask import Flask, jsonify, request
from opentelemetry import trace
from opentelemetry import metrics

# Configuration
OTEL_ENDPOINT = os.getenv('OTEL_EXPORTER_OTLP_ENDPOINT', '192.168.0.243:4318')
SERVICE_NAME = os.getenv('OTEL_SERVICE_NAME', 'python-app')
SERVICE_VERSION = os.getenv('OTEL_SERVICE_VERSION', '1.0.0')

print(f"🔧 Configuring OpenTelemetry for service: {SERVICE_NAME}")
print(f"📡 OTLP Endpoint: {OTEL_ENDPOINT}")

# Set up Flask app
app = Flask(__name__)

# Configure logging (let distro handle OpenTelemetry integration)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("python-app")

# Get tracer and meter (will be auto-configured by distro)
tracer = trace.get_tracer(__name__)
meter = metrics.get_meter(__name__)

# Create some custom metrics to ensure metrics are being sent
request_counter = meter.create_counter(
    name="python_app_requests_total",
    description="Total number of requests",
    unit="1"
)

request_duration = meter.create_histogram(
    name="python_app_request_duration_seconds",
    description="Request duration in seconds",
    unit="s"
)

print("✅ OpenTelemetry initialized successfully")

@app.route('/health')
def health():
    """Health check endpoint"""
    # Record metrics
    request_counter.add(1, {"endpoint": "health"})
    
    start_time = time.time()
    logger.info("Health check requested")
    
    result = jsonify({
        "status": "healthy",
        "service": SERVICE_NAME,
        "timestamp": start_time
    })
    
    # Record duration
    request_duration.record(time.time() - start_time, {"endpoint": "health"})
    
    return result

@app.route('/api/hello')
def hello():
    """Hello endpoint with custom span"""
    name = request.args.get('name', 'World')
    
    logger.info(f"Hello endpoint called for user: {name}")
    
    with tracer.start_as_current_span("custom-operation") as span:
        span.set_attribute("user.name", name)
        
        # Simulate some work
        time.sleep(0.1)
        
        # Add custom metrics
        request_counter.add(1, {"endpoint": "/api/hello", "status": "success"})
        
        logger.info(f"Hello operation completed successfully for user: {name}")
        
        return jsonify({
            "message": f"Hello, {name}!",
            "trace_id": format(span.get_span_context().trace_id, '032x'),
            "timestamp": time.time()
        })

@app.route('/api/error')
def error_endpoint():
    """Endpoint that generates an error"""
    logger.error("Intentional error triggered")
    error = Exception("This is a test error from Python")
    raise error

@app.route('/api/slow')
def slow_endpoint():
    """Slow endpoint for testing tail sampling"""
    duration = int(request.args.get('duration', 2000)) / 1000.0
    
    logger.info(f"Slow endpoint called with duration: {duration}s")
    
    with tracer.start_as_current_span("slow-operation") as span:
        span.set_attribute("duration", duration)
        time.sleep(duration)
        
        logger.info(f"Slow operation completed in {duration}s")
        
        return jsonify({
            "message": "Completed slow operation",
            "duration": duration,
            "timestamp": time.time()
        })

@app.route('/api/data', methods=['POST'])
def data_endpoint():
    """Data submission endpoint with metrics"""
    data = request.get_json() or {}
    value = data.get('value', 0)
    
    logger.info(f"Data received with value: {value}")
    
    # Create custom metric
    data_counter = meter.create_counter(
        name="python_data_submissions_total",
        description="Number of data submissions",
    )
    data_counter.add(1, {"endpoint": "/api/data", "status": "success"})
    
    return jsonify({
        "status": "received",
        "value": value,
        "timestamp": time.time()
    })

@app.route('/api/random')
def random_endpoint():
    """Generate random data with metrics"""
    with tracer.start_as_current_span("random-operation") as span:
        # Generate random data
        random_value = random.randint(1, 100)
        random_delay = random.uniform(0.1, 0.5)
        
        span.set_attribute("random.value", random_value)
        span.set_attribute("random.delay", random_delay)
        
        logger.info(f"Random operation started - value: {random_value}, delay: {random_delay}")
        
        time.sleep(random_delay)
        
        # Record duration metric
        request_duration.record(random_delay, {"endpoint": "/api/random"})
        
        logger.info(f"Random operation completed - value: {random_value}, delay: {random_delay}")
        
        return jsonify({
            "random_value": random_value,
            "delay": random_delay,
            "timestamp": time.time()
        })

@app.errorhandler(Exception)
def handle_error(error):
    """Global error handler"""
    logger.error(f"Unhandled error: {str(error)}", extra={"error": str(error)})
    
    # Record error in current span if available
    current_span = trace.get_current_span()
    if current_span:
        current_span.record_exception(error)
        current_span.set_status(trace.Status(trace.StatusCode.ERROR, str(error)))
    
    return jsonify({
        "error": "Internal Server Error",
        "message": str(error)
    }), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 3002))
    print(f"🚀 Starting Python app on port {port}")
    print(f"📊 Telemetry data is being sent to Alloy at {OTEL_ENDPOINT}")
    print("\nAvailable endpoints:")
    print(f"  GET  http://localhost:{port}/health")
    print(f"  GET  http://localhost:{port}/api/hello?name=X")
    print(f"  GET  http://localhost:{port}/api/error")
    print(f"  GET  http://localhost:{port}/api/slow?duration=X")
    print(f"  POST http://localhost:{port}/api/data")
    print(f"  GET  http://localhost:{port}/api/random")
    
    app.run(host='0.0.0.0', port=port, debug=False)
