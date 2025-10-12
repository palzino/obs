# OPNsense Firewall Log Integration

This guide explains how to configure OPNsense to send firewall logs to Grafana Alloy for correlation with application traces.

## Overview

OPNsense will forward firewall logs via syslog to Alloy, which will:
1. Parse firewall events (pass/block decisions)
2. Extract connection metadata (IPs, ports, protocols)
3. Store logs in Loki
4. Enable correlation with Nginx and application traces

## Configuration Steps

### Step 1: Configure Remote Syslog in OPNsense

1. **Login to OPNsense Web Interface**
   - Navigate to: `https://your-opnsense-ip`

2. **Go to System → Settings → Logging / Targets**

3. **Add a New Remote Logging Target**
   - Click the **`+`** button
   
4. **Configure the Target**:
   ```
   ┌─────────────────────────────────────────────────────┐
   │ Enabled:          ☑ (checked)                       │
   │ Transport:        TCP (or UDP if preferred)         │
   │ Applications:     firewall, web proxy               │
   │ Levels:          Informational, Notice, Warning,   │
   │                   Error, Critical, Alert, Emergency│
   │ Hostname:         <your-alloy-server-ip>           │
   │                   (e.g., 192.168.1.100)            │
   │ Port:             5514                              │
   │ Certificate:      (leave empty for non-TLS)        │
   │ Description:      Alloy Log Collector              │
   └─────────────────────────────────────────────────────┘
   ```

5. **Click Save**

### Step 2: Configure Firewall Logging

1. **Go to Firewall → Log Files → Settings**

2. **Configure Log Settings**:
   ```
   ┌─────────────────────────────────────────────────────┐
   │ Log Firewall Default:  ☑ Enabled                    │
   │ Log Packets Blocked:   ☑ Enabled                    │
   │ Log Packets Passed:    ☑ Enabled                    │
   │ Log Level:             Informational                │
   └─────────────────────────────────────────────────────┘
   ```

3. **Optional: Log Private Networks**
   - Enable if you want to see internal traffic
   
4. **Click Save**

### Step 3: Configure Firewall Rules for Detailed Logging

For specific rules you want to trace:

1. **Go to Firewall → Rules → [Interface]**

2. **Edit or Create a Rule**

3. **Enable Logging for the Rule**:
   ```
   ┌─────────────────────────────────────────────────────┐
   │ Log:  ☑ Log packets that are handled by this rule  │
   └─────────────────────────────────────────────────────┘
   ```

4. **Add Description** (helps with filtering):
   ```
   Description: Allow HTTP/HTTPS to web servers
   ```

5. **Click Save** and **Apply Changes**

### Step 4: Verify Logs are Being Sent

#### Check OPNsense

1. **Go to System → Log Files → General**
   - Look for messages indicating remote logging is active
   - Example: `syslogd: kernel boot file is /boot/kernel/kernel`

2. **Check Firewall Logs**
   - Go to **Firewall → Log Files → Live View**
   - Verify logs are being generated

#### Check Alloy

```bash
# View Alloy logs
docker logs -f alloy | grep opnsense

# Test syslog connectivity from OPNsense shell
echo "test message from opnsense" | nc <alloy-ip> 5514

# Check if Alloy received it
docker logs alloy | grep "test message"
```

#### Check Loki

```bash
# Query Loki for OPNsense logs
curl -G -s "http://localhost:3100/loki/api/v1/query" \
  --data-urlencode 'query={job="opnsense"}' \
  | jq
```

### Step 5: Firewall Log Format

OPNsense sends logs in this format:

```
<134>1 2025-10-12T14:30:00.123456+00:00 opnsense filterlog 12345 - - 
87,,,1000000103,igb0,match,pass,in,4,0x0,,64,12345,0,DF,tcp,60,
203.0.113.5,192.168.1.10,54321,443,0,S,1234567890,,64240,,mss;sackOK;TS
```

**Key Fields** (after splitting by comma):
- Position 0: Rule number
- Position 4: Interface
- Position 6: Action (pass/block)
- Position 7: Direction (in/out)
- Position 16: Protocol (tcp/udp/icmp)
- Position 18: Source IP
- Position 19: Destination IP
- Position 20: Source Port (for TCP/UDP)
- Position 21: Destination Port (for TCP/UDP)

### Step 6: Advanced - Filter Logs by Application

If you only want web traffic logs:

1. **Create Firewall Rule Aliases**
   - Go to **Firewall → Aliases**
   - Create port alias: `WEB_PORTS` → `80, 443, 8080, 8443`

2. **Tag Relevant Rules**
   - Use consistent descriptions like `WEB_TRAFFIC`

3. **Filter in Grafana**
   ```logql
   {job="opnsense"} 
   | regexp "(?P<dst_port>80|443|8080|8443)"
   ```

## Firewall + Trace Correlation

### Correlation Strategy

Since OPNsense doesn't know about trace IDs, we correlate by:

1. **Time Window**: Match firewall log timestamp with trace start time
2. **Source IP**: Match firewall source IP with Nginx `remote_addr`
3. **Destination Port**: Match firewall dest port with your service port

### Example Grafana Query

```logql
# Find firewall logs for a specific trace
# (Assume trace shows remote_addr=203.0.113.5 at 14:30:00)

{job="opnsense"} 
| regexp "(?P<src_ip>\\d+\\.\\d+\\.\\d+\\.\\d+),(?P<dst_ip>\\d+\\.\\d+\\.\\d+\\.\\d+)"
| src_ip="203.0.113.5"
| line_format "{{.src_ip}} → {{.dst_ip}}:{{.dst_port}} [{{.action}}]"
```

### Grafana Dashboard Panel

Create a logs panel with:

```logql
{job=~"opnsense|nginx-access"} 
| json 
| remote_addr="$remote_addr" OR src_ip="$remote_addr"
| line_format "{{.timestamp}} [{{.job}}] {{.message}}"
```

Variables:
- `$remote_addr`: From selected trace span attribute

## Troubleshooting

### Logs not appearing in Alloy

**1. Check OPNsense can reach Alloy**:
```bash
# From OPNsense shell (Diagnostics → Command Prompt)
nc -zv <alloy-ip> 5514
```

**2. Check firewall allows syslog**:
```bash
# In OPNsense, check if rule blocks traffic
# Firewall → Rules → WAN/LAN
# Ensure outgoing to port 5514 is allowed
```

**3. Verify syslog is running**:
```bash
# In OPNsense shell
service syslogd status
```

**4. Check OPNsense logs**:
```bash
# System → Log Files → General
# Look for syslog errors
```

### Logs appearing but not parsed correctly

**1. Check log format in Alloy**:
```bash
docker logs alloy | grep opnsense | head -1
```

**2. Update Alloy regex** if format is different:
Edit `alloy/config.alloy`:
```hcl
stage.regex {
  expression = "your-updated-regex-here"
}
```

### High log volume

**1. Filter by log level**:
In OPNsense → System → Settings → Logging / Targets:
- Change **Levels** to: `Warning, Error, Critical, Alert, Emergency`

**2. Filter by application**:
- Uncheck applications you don't need (e.g., dhcp, pptp)

**3. Sample logs in Alloy**:
```hcl
// In config.alloy
loki.process "opnsense" {
  // Add sampling stage
  stage.sampling {
    rate = 0.1  // Keep 10% of logs
  }
  
  // ... rest of config
}
```

## Security Considerations

### 1. Use TLS for Syslog (Recommended for Production)

**Generate certificates**:
```bash
# On Alloy server
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
```

**Configure Alloy** with TLS:
```hcl
loki.source.syslog "opnsense" {
  listener {
    address  = "0.0.0.0:6514"
    protocol = "tcp"
    tls {
      cert_file = "/etc/alloy/cert.pem"
      key_file  = "/etc/alloy/key.pem"
    }
  }
}
```

**Configure OPNsense**:
- Transport: `TLS (TCP)`
- Port: `6514`
- Certificate: Upload your CA cert

### 2. Firewall Rule

Ensure OPNsense firewall allows outgoing traffic to Alloy:

**Firewall → Rules → LAN → Add Rule**:
```
Action:        Pass
Interface:     LAN
Protocol:      TCP
Source:        This Firewall
Destination:   <Alloy-IP>
Dest. Port:    5514
Description:   Allow syslog to Alloy
```

### 3. Network Segmentation

Consider:
- Dedicated management network for logging
- VLAN isolation
- VPN tunnel for remote logging

## Advanced: Custom Log Parsing

### Parse Specific Traffic Types

**HTTP/HTTPS Traffic Only**:
```hcl
loki.process "opnsense_web" {
  stage.match {
    selector = "{job=\"opnsense\"}"
    
    // Match only web ports
    stage.regex {
      expression = "(?P<dst_port>80|443|8080|8443)"
    }
    
    stage.labels {
      values = {
        traffic_type = "web",
        dst_port = "",
      }
    }
  }
  
  forward_to = [loki.write.default.receiver]
}
```

**Blocked Traffic Only**:
```hcl
stage.match {
  selector = "{job=\"opnsense\"}"
  
  stage.regex {
    expression = ".*block.*"
  }
  
  stage.labels {
    values = {
      action = "block",
    }
  }
}
```

## Example Queries

### Show all blocked traffic to web servers
```logql
{job="opnsense"} 
| regexp ",block," 
| regexp "(?P<dst_port>80|443)"
```

### Count connections by source IP
```logql
sum by(src_ip) (
  count_over_time({job="opnsense"}[5m])
)
```

### Alert on high blocked traffic
```logql
rate({job="opnsense"} | regexp ",block," [1m]) > 100
```

## Next Steps

1. ✅ Configure OPNsense remote logging
2. ✅ Verify logs in Loki
3. 📊 Create correlation dashboard
4. 🔔 Set up alerts for suspicious traffic
5. 📈 Analyze traffic patterns

For full request flow tracking, see [DISTRIBUTED_TRACING.md](DISTRIBUTED_TRACING.md)

