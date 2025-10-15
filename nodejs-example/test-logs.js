// Test script to verify OpenTelemetry logs are working
const logsAPI = require('@opentelemetry/api-logs');

// Get the logger
const logger = logsAPI.logs.getLogger('test-logger');

console.log('Testing OpenTelemetry logs...');

// Try to emit a log
try {
  logger.emit({
    severityNumber: logsAPI.SeverityNumber.INFO,
    severityText: 'INFO',
    body: 'Test log message from Node.js app',
    attributes: {
      service: 'nodejs-app',
      test: true
    },
    timestamp: Date.now() * 1000000,
  });
  console.log('✅ Log emitted successfully');
} catch (error) {
  console.error('❌ Failed to emit log:', error.message);
}

// Wait a bit for the log to be processed
setTimeout(() => {
  console.log('Test complete');
  process.exit(0);
}, 2000);
