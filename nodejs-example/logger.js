// Logger configuration with OpenTelemetry integration
const winston = require('winston');
const { SeverityNumber } = require('@opentelemetry/api-logs');
const api = require('@opentelemetry/api');

// Get OpenTelemetry logger (check if logs API is available)
let otelLogger = null;
try {
  if (api.logs && api.logs.getLogger) {
    otelLogger = api.logs.getLogger('nodejs-app');
  }
} catch (error) {
  console.warn('OpenTelemetry logs API not available:', error.message);
}

// Create Winston logger with trace context
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: process.env.OTEL_SERVICE_NAME || 'nodejs-app' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const activeSpan = api.trace.getActiveSpan();
          const spanContext = activeSpan?.spanContext();
          
          let output = `${timestamp} [${level}]: ${message}`;
          
          // Add trace_id and span_id if available
          if (spanContext) {
            output += ` | trace_id=${spanContext.traceId} span_id=${spanContext.spanId}`;
          }
          
          // Add any additional metadata
          if (Object.keys(meta).length > 0) {
            output += ` ${JSON.stringify(meta)}`;
          }
          
          return output;
        })
      )
    })
  ]
});

// Add trace context to all logs and send via OpenTelemetry
const originalLog = logger.log.bind(logger);
logger.log = function(level, message, meta = {}) {
  const activeSpan = api.trace.getActiveSpan();
  const spanContext = activeSpan?.spanContext();
  
  if (spanContext) {
    meta.trace_id = spanContext.traceId;
    meta.span_id = spanContext.spanId;
    meta.trace_flags = spanContext.traceFlags;
  }
  
  // Send log via OpenTelemetry (if available)
  if (otelLogger) {
    try {
      const severityNumber = getSeverityNumber(level);
      otelLogger.emit({
        severityNumber,
        severityText: level.toUpperCase(),
        body: message,
        attributes: {
          service: process.env.OTEL_SERVICE_NAME || 'nodejs-app',
          level,
          ...meta
        },
        timestamp: Date.now() * 1000000, // Convert to nanoseconds
      });
    } catch (error) {
      console.warn('Failed to send log via OpenTelemetry:', error.message);
    }
  }
  
  return originalLog(level, message, meta);
};

// Helper function to convert Winston levels to OpenTelemetry severity
function getSeverityNumber(level) {
  const levelMap = {
    'error': SeverityNumber.ERROR,
    'warn': SeverityNumber.WARN,
    'info': SeverityNumber.INFO,
    'debug': SeverityNumber.DEBUG,
    'verbose': SeverityNumber.DEBUG,
    'silly': SeverityNumber.DEBUG
  };
  return levelMap[level] || SeverityNumber.INFO;
}

module.exports = logger;

