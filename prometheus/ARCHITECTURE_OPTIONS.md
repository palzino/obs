# Prometheus Scraping Architecture Options

## Current Setup (Option 1): Alloy as Central Collector ✅ RECOMMENDED

**What's happening:**
- ✅ Alloy scrapes all exporters (AdGuard, Nginx, PostgreSQL, Proxmox)
- ✅ Alloy sends metrics to Prometheus via remote_write API
- ✅ Prometheus only scrapes itself
- ✅ No duplicate metrics

**Pros:**
- Single collection point for metrics, logs, and traces
- Consistent labeling and processing
- Easier to add transformations/filtering in Alloy
- Alloy can derive metrics from logs (e.g., `nginx_requests_total`)
- Modern, scalable architecture

**Cons:**
- One more component in the chain
- Slight additional latency (negligible)

**Current Configuration:**
```yaml
# prometheus.yml - Minimal config
scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

# Alloy does all other scraping
```

---

## Alternative Option 2: Direct Prometheus Scraping

If you prefer Prometheus to scrape directly:

**What changes:**
- ❌ Remove all `prometheus.scrape` blocks from `alloy/config.alloy`
- ✅ Keep original `prometheus.yml` with all scrape configs
- ✅ Alloy only handles OTLP data (traces, logs, app metrics)

**Pros:**
- Direct connection between Prometheus and exporters
- One less hop for metrics
- Traditional Prometheus setup

**Cons:**
- Can't derive metrics from logs in Alloy
- Alloy and Prometheus configs must be kept in sync
- Miss out on Alloy's processing capabilities

**To switch to this option:**

1. **Restore prometheus.yml** to original:
```yaml
scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
  - job_name: 'adguard'
    static_configs:
      - targets: ['adguard:9617']
  - job_name: 'nginx'
    static_configs:
      - targets: ['nginx:9113']
  - job_name: 'postgres'
    static_configs:
      - targets: ['pgsql:9187']
  - job_name: 'pve-exporter'
    static_configs:
      - targets: ['proxmox:9221']
```

2. **Edit alloy/config.alloy** and remove these sections:
```hcl
# Remove or comment out:
prometheus.scrape "adguard" { ... }
prometheus.scrape "nginx" { ... }
prometheus.scrape "pgsql" { ... }
prometheus.scrape "proxmox" { ... }
prometheus.scrape "prometheus" { ... }
```

3. **Keep in Alloy** (for host metrics):
```hcl
prometheus.scrape "alloy" { ... }
prometheus.scrape "host_metrics" { ... }
```

---

## Alternative Option 3: Hybrid Approach

**What's happening:**
- Prometheus scrapes some targets directly
- Alloy scrapes others and sends to Prometheus
- Both write to same Prometheus instance

**Use case:**
- Legacy exporters stay with Prometheus
- New OTLP-based services use Alloy

**Caution:**
- ⚠️ Avoid having both scrape the same target (causes duplicates)
- Requires careful coordination

---

## Recommendation

**Stick with Option 1 (Current Setup)** because:

1. **Unified Pipeline**: Everything flows through Alloy
   ```
   Exporters ──┐
   OTLP Apps ──┤
   Logs ───────┼──> Alloy ──> Prometheus
   Traces ─────┤              Loki
   Firewall ───┘              Tempo
   ```

2. **Derived Metrics**: Alloy extracts metrics from logs
   - `nginx_requests_total` from access logs
   - `nginx_request_duration_seconds` histogram
   - `opnsense_packets_total` from firewall logs

3. **Consistent Labels**: Alloy can add/modify labels consistently
   ```hcl
   stage.labels {
     values = {
       environment = "production",
       cluster     = "home-lab",
     }
   }
   ```

4. **Processing**: Filter, transform, or sample before storing
   ```hcl
   stage.drop {
     expression = ".*health-check.*"
   }
   ```

5. **Future-Proof**: Easy to add new data sources

---

## Testing Current Setup

Verify metrics are flowing through Alloy:

```bash
# 1. Check Alloy is scraping
curl http://localhost:12345/metrics | grep prometheus_scrape

# 2. Check Alloy is sending to Prometheus
curl http://localhost:12345/metrics | grep prometheus_remote_write

# 3. Check Prometheus has the metrics
curl -s 'http://localhost:9090/api/v1/query?query=up' | jq '.data.result[] | {job: .metric.job, instance: .metric.instance, value: .value[1]}'

# 4. Expected jobs in Prometheus:
# - prometheus (scraped by Prometheus itself)
# - adguard (scraped by Alloy)
# - nginx (scraped by Alloy)
# - pgsql (scraped by Alloy)
# - proxmox (scraped by Alloy)
# - alloy (scraped by Alloy)
# - host (scraped by Alloy)
```

---

## When to Change Architecture

**Switch to Option 2 (Direct Prometheus) if:**
- You don't need log-to-metric conversion
- You want simplest possible setup
- You're having issues with Alloy

**Keep Option 1 (Current) if:**
- You want distributed tracing with log correlation
- You want to derive metrics from logs
- You want a unified observability platform
- You plan to scale up

---

## Configuration Summary

**Current prometheus.yml:**
- Minimal config
- Only self-scraping
- Receives metrics via remote_write from Alloy

**Current alloy/config.alloy:**
- Scrapes all exporters
- Receives OTLP data
- Processes logs and traces
- Derives metrics from logs
- Sends everything to appropriate backends

**Result:**
- No duplicate metrics
- Single source of truth (Alloy)
- Complete observability stack

