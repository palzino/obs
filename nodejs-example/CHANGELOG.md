# Changelog

## [Fixed] - 2025-10-14

### Bug Fix: SDK Initialization Error

**Problem:**
```
TypeError: Cannot read properties of undefined (reading 'then')
    at Object.<anonymous> (/Users/palvirgill/Documents/GitHub/obs/nodejs-example/tracing.js:69:3)
```

**Root Cause:**
The `sdk.start()` method in `@opentelemetry/sdk-node` is synchronous and does not return a Promise. Attempting to call `.then()` on `undefined` caused the error.

**Solution:**
Changed from async Promise handling to synchronous try-catch:

```javascript
// Before (incorrect):
sdk.start()
  .then(() => {
    console.log('✅ OpenTelemetry tracing initialized successfully');
  })
  .catch((error) => {
    console.error('❌ Error initializing OpenTelemetry:', error);
  });

// After (correct):
try {
  sdk.start();
  console.log('✅ OpenTelemetry tracing initialized successfully');
} catch (error) {
  console.error('❌ Error initializing OpenTelemetry:', error);
}
```

### Verification

App now starts successfully and generates telemetry:

```bash
$ npm start
🔧 Configuring OpenTelemetry for service: nodejs-app
📡 OTLP Endpoint: 192.168.0.243:4318
✅ OpenTelemetry tracing initialized successfully
🚀 Server running at http://localhost:3001
```

Traces are generated with valid trace IDs:
```json
{
  "message": "Hello, TestUser!",
  "trace_id": "5a097ef69690fb28d7651837c562e909",
  "timestamp": "2025-10-14T16:24:19.605Z"
}
```

### Files Modified
- `tracing.js` - Fixed SDK initialization and shutdown handlers

