// OpenTelemetry Tracing Configuration
// This file should be loaded BEFORE your application code

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-grpc');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-grpc');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');

// Configure the OTLP exporter endpoint (Alloy gRPC endpoint)
const ALLOY_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '192.168.0.243:4318';
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'nodejs-app';
const SERVICE_VERSION = process.env.OTEL_SERVICE_VERSION || '1.0.0';

console.log(`🔧 Configuring OpenTelemetry for service: ${SERVICE_NAME}`);
console.log(`📡 OTLP Endpoint: ${ALLOY_ENDPOINT}`);

// Create resource with service information
const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
  [SemanticResourceAttributes.SERVICE_VERSION]: SERVICE_VERSION,
  [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
});

// Configure OTLP exporters
const traceExporter = new OTLPTraceExporter({
  url: `http://${ALLOY_ENDPOINT}`,
});

const metricExporter = new OTLPMetricExporter({
  url: `http://${ALLOY_ENDPOINT}`,
});

const logExporter = new OTLPLogExporter({
  url: `http://${ALLOY_ENDPOINT}`,
});

// Initialize the SDK
const sdk = new NodeSDK({
  resource: resource,
  traceExporter: traceExporter,
  metricReader: new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 5000, // Export metrics every 5 seconds
  }),
  logRecordProcessor: new BatchLogRecordProcessor(logExporter),
  instrumentations: [
    getNodeAutoInstrumentations({
      // Customize auto-instrumentation here
      '@opentelemetry/instrumentation-fs': {
        enabled: false, // Disable file system instrumentation (too verbose)
      },
      '@opentelemetry/instrumentation-http': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-express': {
        enabled: true,
      },
    }),
  ],
});

// Start the SDK
try {
  sdk.start();
  console.log('✅ OpenTelemetry tracing initialized successfully');
} catch (error) {
  console.error('❌ Error initializing OpenTelemetry:', error);
}

// Gracefully shut down the SDK on process exit
process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => {
      console.log('👋 OpenTelemetry terminated');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error terminating OpenTelemetry', error);
      process.exit(1);
    });
});

// Export SDK for use in application if needed
module.exports = sdk;

