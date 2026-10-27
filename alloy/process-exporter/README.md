# VM process metrics

Deployment assets for pinned process-exporter v0.8.7 on these VMs:

| VM | SSH | Exporter | Service manager |
|---|---|---|---|
| dev-box-vm | nino@192.168.0.131 | 192.168.0.131:9256 | systemd |
| Alpine-Jellyfin / ZinoHub | root@192.168.0.33 | 192.168.0.33:9256 | OpenRC |

Alloy scrapes every 15 seconds and remote-writes to Prometheus, preserving the
node-exporter `instance` and `proxmox_guest` labels. Prometheus needs no additional
scrape job. The Compose Alloy config label triggers recreation on deployment.

## Installation / updates

Copy this directory to each VM, then run `sudo sh install.sh` (or `sh install.sh`
as root). The installer downloads the pinned upstream amd64 archive, verifies
its SHA-256, installs the binary/config, and enables/restarts only process-exporter.
Requires HTTPS access to GitHub, curl or wget, tar, sha256sum, and install.
Running the installer again applies config updates. Files in this directory are
deployment assets; the central Compose deployment does not install remote agents.

The exporter runs as root to read all process I/O counters. It listens on TCP 9256;
allow access from the monitoring host (192.168.0.243) on trusted networks only.
Thread breakdown and smaps collection are disabled to reduce scrape overhead.

Specific matches precede a fallback group per executable (`comm`). ZinoHub
environment groups rely on absolute executable paths; verify actual groups after
installation. Relative invocations fall back to the executable name. Tools such
as FFmpeg and Go compilers are grouped independently, including runner children;
`actions-runner` is not an inclusive total of every separately matched tool.
No PIDs, job IDs, or media names are exported as group labels. RSS totals may
double-count shared pages; use node-exporter for total VM memory consumption.

## Verification

On each VM: `curl -fsS http://127.0.0.1:9256/metrics` (or wget).
Check `namedprocess_scrape_errors` and partial/procread errors; they must not be
ignored when interpreting missing groups or zero I/O counters.

In Prometheus, verify both targets:

```promql
up{job="prometheus.scrape.process_exporter"}
```

CPU equivalents (1 = one logical CPU busy):

```promql
sum by (instance, groupname) (
  rate(namedprocess_namegroup_cpu_seconds_total[5m])
)
```

Resident and swapped process memory:

```promql
namedprocess_namegroup_memory_bytes{memtype=~"resident|swapped"}
```

Disk reads/writes: `rate(namedprocess_namegroup_read_bytes_total[5m])` and
`rate(namedprocess_namegroup_write_bytes_total[5m])`. These need process read
permissions and do not replace device-level node-exporter I/O metrics.

For rollback, remove the Alloy scrape block, bump its Compose config label, then
stop/disable process-exporter on the VMs. Keep the binary/config if planning to
re-enable it. Historical metrics remain in Prometheus until retention expires.
