#!/usr/bin/env python3
"""
Load testing script for Python OpenTelemetry demo
"""

import requests
import time
import random
import json

BASE_URL = "http://localhost:3002"

def make_request(method, endpoint, data=None, description=""):
    """Make a request and show result"""
    print(f"→ {description}")
    
    try:
        if method == "POST":
            response = requests.post(f"{BASE_URL}{endpoint}", json=data)
        else:
            response = requests.get(f"{BASE_URL}{endpoint}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"  ✅ {json.dumps(result, indent=2)}")
        else:
            print(f"  ❌ Error {response.status_code}: {response.text}")
    except Exception as e:
        print(f"  ❌ Request failed: {e}")
    
    time.sleep(0.5)
    print()

def main():
    print("🧪 Starting load test for Python OpenTelemetry demo")
    print("This will generate traces, metrics, and logs...")
    print()
    
    print(f"Target: {BASE_URL}")
    print()
    
    # Health check
    make_request("GET", "/health", None, "Health check")
    
    # Normal requests
    print("📊 Generating normal traffic...")
    for i in range(1, 6):
        make_request("GET", f"/api/hello?name=User{i}", None, f"Hello request {i}")
    
    # Data submissions (metrics)
    print("📈 Generating metric events...")
    for i in range(1, 4):
        value = random.randint(0, 100)
        make_request("POST", "/api/data", {"value": value}, f"Data submission {i}")
    
    # Slow requests (will trigger tail sampling)
    print("🐌 Generating slow traces...")
    for duration in [1500, 2500, 3000]:
        make_request("GET", f"/api/slow?duration={duration}", None, f"Slow request ({duration}ms)")
    
    # Error requests (will be 100% sampled)
    print("❌ Generating error traces...")
    for i in range(1, 3):
        print(f"→ Error request {i}")
        try:
            response = requests.get(f"{BASE_URL}/api/error")
            print(f"  ❌ Error {response.status_code}: {response.json()}")
        except Exception as e:
            print(f"  ❌ Error captured: {e}")
        time.sleep(0.5)
        print()
    
    # Random requests
    print("🎲 Generating random requests...")
    for i in range(1, 4):
        make_request("GET", "/api/random", None, f"Random request {i}")
    
    # Burst of traffic
    print("🚀 Generating traffic burst...")
    import threading
    
    def burst_request(i):
        try:
            response = requests.get(f"{BASE_URL}/api/hello?name=Burst{i}")
        except:
            pass
    
    threads = []
    for i in range(1, 11):
        thread = threading.Thread(target=burst_request, args=(i,))
        threads.append(thread)
        thread.start()
    
    for thread in threads:
        thread.join()
    
    print()
    print("✅ Load test complete!")
    print()
    print("Check your Grafana instance for:")
    print("  • Traces in Tempo (service: python-app)")
    print("  • Metrics in Prometheus (service_name: python-app)")
    print("  • Logs in Loki (service: python-app)")
    print()
    print("Sample queries:")
    print("  Tempo:      service.name=\"python-app\"")
    print("  Prometheus: {service_name=\"python-app\"}")
    print("  Loki:       {service=\"python-app\"}")

if __name__ == "__main__":
    main()
