# obs improvements backlog

Living checklist for the homelab observability stack (Alloy, Prometheus, Loki, Tempo, Grafana). Terraform-managed dashboards live in `grafana-dashboards/dashboards/obs/` and deploy via CI on push to `main`.

---

## Current state (done)

### Terraform / CI

- [x] Grafana folder `obs` (`dfsfszt2tzpc0e`) managed by Terraform
- [x] Dashboards deployed from `dashboards/obs/*.json` with `overwrite = true`
- [x] GitHub Actions workflow: plan on PR, apply on push
- [x] 6 alert rules in `alerts.tf` → Telegram contact point (`telegram`)
- [x] One-time `imports.tf` for MCP-created resources (rule group + early dashboards)

### Alloy (`alloy/config.alloy`)

- [x] Proxmox scrape fix (`instance = "192.168.0.65"`)
- [x] cAdvisor moved to Alloy (removed duplicate from `prometheus/prometheus.yml`)
- [x] `proxmox_guest` relabelling on node_exporter and cadvisor targets for guest reconcile
- [x] Physical OPNsense at `192.168.0.1` monitored via node exporter; no `proxmox_guest` label (hot-standby Proxmox VM excluded)

### Dashboards in `obs` folder (12)

| Dashboard | UID | Notes |
|-----------|-----|-------|
| Overview | `obs-overview` | Fleet at-a-glance — good Grafana home dashboard candidate |
| Monitoring stack | `obs-monitoring-stack` | Prometheus, Alloy, core containers on monitoring VM |
| OPNsense | `obs-opnsense` | Physical firewall at `192.168.0.1` |
| Node Exporter | `obs-node-exporter` | Lightweight per-host Linux metrics |
| Proxmox via Prometheus | `Dp7Cd57Zza` | Host CPU fix applied (raw `pve_cpu_usage_ratio` for nodes) |
| Guest reconcile | `obs-guest-reconcile` | Proxmox vs node vs cAdvisor via `$guest` variable |
| cAdvisor | `obs-cadvisor` | Docker containers per host |
| PostgreSQL | `obs-postgresql` | Plain Docker exporter at `pgsql:9187` |
| NGINX | `obs-nginx` | Reverse proxy exporter |
| AdGuard Exporter | `MIBVglomg` | DNS filtering (existing layout, fixed datasource) |
| qBittorrent | `OEyH9tQZk` | Torrent client (existing layout, fixed datasource) |
| OpenTelemetry APM | `obs-otel-apm` | App traces/metrics/logs |

### Alert rules (`obs infrastructure` → Telegram)

| Rule | Severity | For |
|------|----------|-----|
| Node exporter down | critical | 5m |
| Alloy exporter down | critical | 5m |
| Root disk >90% | warning | 10m |
| Host memory >95% | warning | 10m |
| Host CPU >90% | warning | 15m |
| Proxmox guest stopped | warning | 5m (excludes Opnsense standby) |

---

## Easy wins (housekeeping)

Quick tasks — no new dashboards required.

| Task | Effort | Notes |
|------|--------|-------|
| Set Overview as Grafana home dashboard | 1 min | Preferences → Home Dashboard → **Overview** (`obs-overview`) |
| Archive legacy dashboards in General | 5 min | See list below — overlap with obs replacements |
| Delete `grafana-dashboards/scripts/` locally | 1 min | One-off migration tooling; already gitignored, not used by CI |
| Remove `imports.tf` | 2 min | After confirming a clean Terraform apply without import drift |

### Legacy dashboards to archive (General folder)

These duplicate obs-managed boards and cause confusion:

- **Node Exporter Full** → replaced by `obs-node-exporter`
- **NGINX exporter** (General) → replaced by `obs-nginx`
- **PostgreSQL** (`000000039`) → replaced by `obs-postgresql`
- **PostgreSQL Overview** (`5474745`) → replaced by `obs-postgresql`
- **cadvisor dashboard** / **Basic Cadvisor** → replaced by `obs-cadvisor`

Keep if still useful:

- **Proxmox 7/8 InfluxDB2** — separate Influx pipeline for deep Proxmox troubleshooting (intentionally not merged with Prometheus path)

---

## Next tier — dashboards

Priority order for new work.

### 1. Loki logs overview — high value, medium effort

Loki is running (Docker + syslog + OTLP) but has no dedicated dashboard.

Suggested panels:

- Log volume by job / container / `service_name`
- Error rate (`detected_level=error` or pattern match)
- Top noisy containers
- Pairs well with `obs-otel-apm` for app debugging

### 2. Docker fleet summary — medium effort

Overview shows total container count; a dedicated board could aggregate cAdvisor across all Docker hosts:

- lab-pgdb, prod-apps, ark, monitoring-stack, etc.
- Per-host container health, top CPU/memory consumers fleet-wide

### 3. Tempo / traces overview — lower priority

`obs-otel-apm` covers app RED metrics and trace links. A Tempo-native board (trace rate, latency, error rate by service) is nice-to-have if otel-apm gaps appear.

### 4. k3s cluster — when needed

k3s VMs exist on Proxmox but no kube metrics yet. Defer until operational k3s visibility is required (kube-state-metrics, cAdvisor/node per node, or Alloy k8s discovery).

---

## Infrastructure gaps

Improvements outside dashboard JSON.

| Gap | Impact | Action |
|-----|--------|--------|
| **Node exporter on monitoring-stack VM** | Guest reconcile incomplete for that guest | Install node_exporter; add Alloy scrape + `proxmox_guest = "monitoring-stack"` |
| **cAdvisor on Alpine-Jellyfin** (`192.168.0.33`) | Docker host visible via node exporter only, no container breakdown | Optional: deploy cAdvisor if container-level metrics needed |
| **Node exporters down** (e.g. minecraft, ark-server) | Alerts fire after `for` duration | Fix exporter services on those VMs |
| **Legacy duplicate dashboards** | UI clutter, stale datasource UIDs | Archive per list above |

### `proxmox_guest` mappings (Alloy)

Current node_exporter → guest links:

| Instance | Proxmox guest |
|----------|---------------|
| zinohub | Alpine-Jellyfin |
| database-vm | lab-pgdb |
| prod-docker-server | prod-apps |
| qbit | qbit-linux |
| minecraft | mc-server |
| wg | wireguard |
| nginx | ng-alpine |
| ark-server | ark |
| opnsense | *(none — physical appliance)* |
| proxmox hypervisor | *(none — hypervisor node)* |

cAdvisor mappings: lab-pgdb, prod-apps, ark, monitoring-stack.

---

## Intentionally not doing

Design decisions to avoid scope creep:

- **Influx → Prometheus bridge** — keep Proxmox Influx and Prometheus pipelines separate
- **Influx Proxmox dashboard migration** — stays in General; use for deep troubleshooting only
- **Service-owned dashboards** — zinohub, zino-ci, etc. stay in their own repos / deploy pipelines
- **Helper scripts in `grafana-dashboards/scripts/`** — migration-only; delete locally, do not commit

---

## Dashboard ownership model

| Type | Owner | Deployed from |
|------|-------|---------------|
| Platform / stack (Alloy, Prometheus, Loki, infra) | obs | `obs/grafana-dashboards` |
| Shared APM / cross-service views | obs | `obs/grafana-dashboards` |
| Service-specific deep dives | Each service repo | That service's CI |
| In-stack services without their own pipeline | obs | `obs/grafana-dashboards` |

---

## Key paths

| Path | Purpose |
|------|---------|
| `grafana-dashboards/dashboards/obs/*.json` | Dashboard source of truth |
| `grafana-dashboards/alerts.tf` | Alert rules |
| `grafana-dashboards/main.tf` | Folder + dashboard resources |
| `grafana-dashboards/imports.tf` | One-time imports (remove when stable) |
| `alloy/config.alloy` | Scrapes, OTLP, `proxmox_guest` labels |
| `prometheus/prometheus.yml` | Self-scrape only |

---

## Suggested next session

Pick one:

1. **Loki logs overview** — highest remaining dashboard value
2. **Archive legacy dashboards** — quick UI cleanup
3. **Node exporter on monitoring-stack VM** — closes reconcile gap
4. **Docker fleet summary** — fleet-wide container view
