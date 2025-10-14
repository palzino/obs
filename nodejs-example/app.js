// Sample Express.js application with OpenTelemetry auto-instrumentation
const express = require('express');
const logger = require('./logger');
const api = require('@opentelemetry/api');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware to parse JSON
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  logger.info('Health check requested');
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Sample endpoint with custom span
app.get('/api/hello', async (req, res) => {
  const tracer = api.trace.getTracer('nodejs-app');
  const name = req.query.name || 'World';
  
  logger.info('Hello endpoint called', { name });
  
  // Create a custom span
  const span = tracer.startSpan('custom-operation');
  span.setAttribute('user.name', name);
  
  try {
    // Simulate some work
    await simulateWork(100);
    
    logger.info('Hello operation completed successfully', { name });
    span.setStatus({ code: api.SpanStatusCode.OK });
    
    res.json({ 
      message: `Hello, ${name}!`,
      trace_id: span.spanContext().traceId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error in hello endpoint', { error: error.message });
    span.setStatus({ 
      code: api.SpanStatusCode.ERROR,
      message: error.message 
    });
    res.status(500).json({ error: error.message });
  } finally {
    span.end();
  }
});

// Endpoint that simulates an error
app.get('/api/error', (req, res) => {
  logger.error('Intentional error triggered');
  const error = new Error('This is a test error');
  
  // This will be captured by OpenTelemetry
  throw error;
});

// Endpoint with slow response
app.get('/api/slow', async (req, res) => {
  const duration = parseInt(req.query.duration) || 2000;
  
  logger.info('Slow endpoint called', { duration });
  
  await simulateWork(duration);
  
  logger.info('Slow operation completed');
  res.json({ 
    message: 'Completed slow operation',
    duration,
    timestamp: new Date().toISOString()
  });
});

// Endpoint with metrics
app.post('/api/data', (req, res) => {
  const { value } = req.body;
  
  logger.info('Data received', { value });
  
  // Create custom metric
  const meter = api.metrics.getMeter('nodejs-app');
  const counter = meter.createCounter('data_submissions', {
    description: 'Number of data submissions',
  });
  
  counter.add(1, { 
    endpoint: '/api/data',
    status: 'success'
  });
  
  res.json({ 
    status: 'received',
    value,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { 
    error: err.message,
    stack: err.stack,
    path: req.path
  });
  
  const span = api.trace.getActiveSpan();
  if (span) {
    span.recordException(err);
    span.setStatus({ 
      code: api.SpanStatusCode.ERROR,
      message: err.message 
    });
  }
  
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: err.message
  });
});

// Helper function to simulate async work
function simulateWork(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Start server
app.listen(PORT, () => {
  logger.info(`Server started on port ${PORT}`, { port: PORT });
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  GET  /health           - Health check`);
  console.log(`  GET  /api/hello?name=X - Hello endpoint`);
  console.log(`  GET  /api/error        - Trigger error`);
  console.log(`  GET  /api/slow?duration=X - Slow response`);
  console.log(`  POST /api/data         - Submit data`);
  console.log(`\n📊 Telemetry data is being sent to Alloy at 192.168.0.243:4318`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

