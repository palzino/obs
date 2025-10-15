#!/bin/bash
# Start Python app with OpenTelemetry distro

export OTEL_SERVICE_NAME=python-app
export OTEL_SERVICE_VERSION=1.0.0
export OTEL_EXPORTER_OTLP_ENDPOINT=http://192.168.0.243:4318
export OTEL_RESOURCE_ATTRIBUTES="service.name=python-app,service.version=1.0.0"

echo "🚀 Starting Python app with OpenTelemetry distro..."
echo "📡 OTLP Endpoint: $OTEL_EXPORTER_OTLP_ENDPOINT"

# Use opentelemetry-instrument to run the app with auto-instrumentation
# This will automatically detect Flask and apply instrumentation
# Include logging instrumentation for proper log correlation
opentelemetry-instrument --traces_exporter otlp --metrics_exporter otlp --logs_exporter otlp python main.py
