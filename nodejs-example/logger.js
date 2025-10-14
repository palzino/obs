// Logger configuration with OpenTelemetry integration
const winston = require('winston');
const { SeverityNumber } = require('@opentelemetry/api-logs');
const api = require('@opentelemetry/api');

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

// Add trace context to all logs
const originalLog = logger.log.bind(logger);
logger.log = function(level, message, meta = {}) {
  const activeSpan = api.trace.getActiveSpan();
  const spanContext = activeSpan?.spanContext();
  
  if (spanContext) {
    meta.trace_id = spanContext.traceId;
    meta.span_id = spanContext.spanId;
    meta.trace_flags = spanContext.traceFlags;
  }
  
  return originalLog(level, message, meta);
};

module.exports = logger;

