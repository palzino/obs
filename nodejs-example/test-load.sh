#!/bin/bash

# Load testing script to generate telemetry data

echo "🧪 Starting load test for OpenTelemetry demo"
echo "This will generate traces, metrics, and logs..."
echo ""

BASE_URL=${1:-http://localhost:3001}

echo "Target: $BASE_URL"
echo ""

# Function to make a request and show result
make_request() {
  local method=$1
  local endpoint=$2
  local data=$3
  local description=$4
  
  echo "→ $description"
  
  if [ "$method" == "POST" ]; then
    curl -s -X POST "$BASE_URL$endpoint" \
      -H "Content-Type: application/json" \
      -d "$data" | jq -c '.' 2>/dev/null || echo "Request sent"
  else
    curl -s "$BASE_URL$endpoint" | jq -c '.' 2>/dev/null || echo "Request sent"
  fi
  
  sleep 0.5
  echo ""
}

# Health check
make_request GET /health "" "Health check"

# Normal requests
echo "📊 Generating normal traffic..."
for i in {1..5}; do
  make_request GET "/api/hello?name=User$i" "" "Hello request $i"
done

# Data submissions (metrics)
echo "📈 Generating metric events..."
for i in {1..3}; do
  make_request POST /api/data '{"value": '$((RANDOM % 100))'}' "Data submission $i"
done

# Slow requests (will trigger tail sampling)
echo "🐌 Generating slow traces..."
for duration in 1500 2500 3000; do
  make_request GET "/api/slow?duration=$duration" "" "Slow request (${duration}ms)"
done

# Error requests (will be 100% sampled)
echo "❌ Generating error traces..."
for i in {1..2}; do
  echo "→ Error request $i"
  curl -s "$BASE_URL/api/error" 2>/dev/null || echo "Error captured"
  sleep 0.5
  echo ""
done

# Burst of traffic
echo "🚀 Generating traffic burst..."
for i in {1..10}; do
  curl -s "$BASE_URL/api/hello?name=Burst$i" > /dev/null &
done
wait

echo ""
echo "✅ Load test complete!"
echo ""
echo "Check your Grafana instance for:"
echo "  • Traces in Tempo (service: nodejs-app)"
echo "  • Metrics in Prometheus (job: nodejs-app)"
echo "  • Logs in Loki (service: nodejs-app)"
echo ""
echo "Sample queries:"
echo "  Tempo:      service.name=\"nodejs-app\""
echo "  Prometheus: {job=\"nodejs-app\"}"
echo "  Loki:       {service=\"nodejs-app\"}"

