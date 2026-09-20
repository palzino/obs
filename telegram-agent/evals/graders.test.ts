import { expect, test } from "bun:test";
import type { AgentTurn } from "../src/agent.ts";
import { loadFixtures } from "./fixtures.ts";
import { grade, gradeQuality, passed } from "./graders.ts";
import { resolveFixtureResult } from "./mocks.ts";

const fixturesDir = `${import.meta.dir}/fixtures`;

const loadFixture = async (id: string) => {
  const [fixture] = await loadFixtures(fixturesDir, id);
  return fixture;
};

const nginxFixture = () => loadFixture("nginx-error-logs");
const healthFixture = () => loadFixture("system-health");

const badNginx: AgentTurn = {
  model: "test",
  usage: {},
  tools: [
    {
      name: "query_loki_logs",
      input: { datasourceUid: "loki", logql: "*" },
      output: { error: 'syntax error: unexpected IDENTIFIER' },
    },
    {
      name: "query_prometheus",
      input: { datasourceUid: "1", expr: "up" },
      output: { error: "datasource 1 is not accessible for querying" },
    },
    {
      name: "search_dashboards",
      input: { query: "nginx" },
      output: [{ title: "NGINX", uid: "obs-nginx" }],
    },
  ],
  text: `Based on my investigation, I found the following:

**Summary:**
- **Loki logs query**: Failing with "syntax error: unexpected IDENTIFIER" - the Loki API is not accepting queries (even with wildcard "*")
- **Prometheus query**: The Prometheus datasource (UID "1") is not accessible for querying
- **NGINX dashboard**: Found an NGINX dashboard (\`obs-nginx\`) that monitors nginx via Prometheus metrics, but it only shows operational metrics (active connections, requests, etc.) - no error log panels

**Current Status:**
Unfortunately, I'm unable to confirm whether there are nginx error logs in the past 72 hours because:

1. The Loki instance (which would contain nginx error logs) is not functional - all log queries return parse errors
2. The Prometheus datasource is not accessible for querying metrics
3. The NGINX dashboard only exposes operational metrics, not error log data

**What I found:**
- The NGINX dashboard (\`obs-nginx\`) exists and tracks nginx performance via Prometheus
- Common nginx metrics available in the dashboard include:
  - \`nginx_http_requests_total\`
  - \`nginx_connections_active\`
  - \`nginx_connections_accepted\`
  - \`nginx_http_requests_rate\`

To properly answer your question, the Loki log collection system appears to be malfunctioning. You may need to:
1. Check the Loki cluster health and configuration
2. Verify the nginx log rotation and forwarding to Loki is working
3. Ensure the Loki query parser is properly configured

Would you like me to investigate the Loki cluster health further or check if there are alternative ways to access nginx error logs?`,
};

const goodNginx: AgentTurn = {
  model: "test",
  usage: {},
  tools: [
    {
      name: "query_loki_logs",
      input: {
        datasourceUid: "loki",
        logql: '{service_name="nginx"} |= "error"',
        startRfc3339: "now-72h",
      },
      output: {
        count: 664,
        lines: [
          "502 Bad Gateway spotify.palzinode.co.uk upstream 192.168.1.16:3500 Connection refused",
        ],
        note: "All 664 error lines are 502 Bad Gateway",
      },
    },
  ],
  text: `Finding: **664** nginx **502**s in 72h
• Cause: Connection refused to 192.168.1.16:3500 (spotify.palzinode.co.uk)
• Events: scanner 35.205.88.64; OAI-SearchBot /robots.txt
• Other: auth-server/fitnessai/authentik on that host still healthy`,
};

test("bad nginx investigation essay fails the fixture", async () => {
  const fixture = await nginxFixture();
  const checks = grade(fixture, badNginx);
  expect(passed(checks)).toBe(false);
  expect(checks.filter((check) => !check.ok).map((check) => check.id)).toEqual(
    expect.arrayContaining([
      "tools.must_call.0.query_loki_logs",
      "content.must_include_any",
      "style.no_follow_up_question",
      "style.no_investigation_essay",
    ]),
  );
});

test("if you want I can follow-ups fail style.no_follow_up_question", async () => {
  const fixture = await nginxFixture();
  const checks = grade(fixture, {
    ...goodNginx,
    text: `${goodNginx.text}\nIf you want I can drill into that host.`,
  });
  expect(checks.filter((check) => !check.ok).map((check) => check.id)).toEqual(
    expect.arrayContaining(["style.no_follow_up_question"]),
  );
});

test("good nginx operator reply passes the fixture", async () => {
  const fixture = await nginxFixture();
  const checks = grade(fixture, goodNginx);
  expect(checks.filter((check) => !check.ok)).toEqual([]);
  expect(passed(checks)).toBe(true);
});

test("wildcard loki query gets a syntax error from unmatched fixtures", async () => {
  const fixture = await nginxFixture();
  expect(
    resolveFixtureResult(fixture.tools, "query_loki_logs", {
      datasourceUid: "loki",
      logql: "*",
    }),
  ).toEqual({ error: "syntax error: unexpected IDENTIFIER" });
});

test("valid loki selector returns the canned 502 lines", async () => {
  const fixture = await nginxFixture();
  const result = resolveFixtureResult(fixture.tools, "query_loki_logs", {
    datasourceUid: "loki",
    logql: '{service_name="nginx"} |= "error"',
  });
  expect(result).toEqual(
    expect.objectContaining({
      count: 664,
    }),
  );
});

test("numeric prometheus uid is treated as inaccessible", async () => {
  const fixture = await nginxFixture();
  expect(
    resolveFixtureResult(fixture.tools, "query_prometheus", {
      datasourceUid: "1",
      expr: "up",
    }),
  ).toEqual({ error: "datasource 1 is not accessible for querying" });
});

const badHealth: AgentTurn = {
  model: "test",
  usage: {},
  tools: [
    {
      name: "query_loki_logs",
      input: { datasourceUid: "8", logql: "*" },
      output: { logs: [], entries: 0 },
    },
    {
      name: "query_prometheus",
      input: { datasourceUid: "1", expr: "up" },
      output: { error: "datasource 1 is not accessible for querying" },
    },
    {
      name: "search_dashboards",
      input: { query: "overview" },
      output: [{ title: "Overview", uid: "obs-overview" }],
    },
    {
      name: "get_dashboard_summary",
      input: { uid: "obs-overview" },
      output: { title: "Overview", panels: 23 },
    },
  ],
  text: `Based on my investigation, here's the system health status:

## System Health Summary

**No scary error logs in the past 24 hours**

- **Loki** (both loki UIDs 8 and 5): Queries returned **zero log entries** in the last 24 hours. No error logs were found.
- **Prometheus** (uid "1"): The system is responding normally - the dashboard shows active monitoring with CPU, memory, disk I/O, network I/O, and resource usage panels.
- **Tempo** (uid "7"): Also functioning with alert lists and historical data accessible.

## Overall System Status

The homelab infrastructure appears healthy:

- **Node Exporter** (observed via \`obs-node-exporter\` dashboard): Scraping status is active with CPU, memory, disk, and load metrics being collected.
- **Proxmox** (\`dp7cdzva\` dashboard): Resource allocation, CPU, memory, and guest usage are being monitored.
- **Overview dashboard** (\`obs-overview\`): Shows 23 panels covering hosts, Proxmox, containers, NGINX, PostgreSQL, AdGuard, and other services - all appear operational.
- **Key services** (from overview): NGINX, PostgreSQL, AdGuard, cAdvisor, qBittorrent, Alloy, and Prometheus are all present and reporting.

**Conclusion:** The system is operating normally with no critical errors detected in the last 24 hours. The lack of Loki logs could indicate either quiet operation or that logging hasn't produced entries recently. All core components (monitoring, storage, compute) appear healthy.`,
};

const goodHealth: AgentTurn = {
  model: "test",
  usage: {},
  tools: [
    {
      name: "alerting_manage_rules",
      input: { operation: "list" },
      output: { rules: [], firing: 0, note: "No firing alerts" },
    },
    {
      name: "query_prometheus",
      input: {
        datasourceUid: "prometheus",
        expr: 'up{job="prometheus.scrape.node_exporter"}',
      },
      output: {
        result: [
          { metric: { instance: "opnsense" }, value: [1779220000, "0"] },
          { metric: { instance: "minecraft" }, value: [1779220000, "0"] },
          { metric: { instance: "ark-server" }, value: [1779220000, "0"] },
          { metric: { instance: "proxmox" }, value: [1779220000, "1"] },
        ],
      },
    },
    {
      name: "query_prometheus",
      input: {
        datasourceUid: "prometheus",
        expr: 'probe_success{job=~"integrations/blackbox/.+"}',
      },
      output: {
        result: [
          { metric: { job: "integrations/blackbox/zinohub" }, value: [1779220000, "1"] },
        ],
      },
    },
    {
      name: "query_prometheus",
      input: {
        datasourceUid: "prometheus",
        expr: 'node_memory_MemAvailable_bytes{job="prometheus.scrape.node_exporter"}',
      },
      output: {
        result: [{ metric: { instance: "database-vm" }, value: [1779220000, "97"] }],
      },
    },
    {
      name: "query_loki_logs",
      input: {
        datasourceUid: "loki",
        logql: '{detected_level="error"}',
      },
      output: { count: 664, note: "664 nginx 502 Bad Gateway" },
    },
    {
      name: "search_tempo_traces",
      input: { query: '{resource.service.name="nginx" && status=error}' },
      output: { traces: [{ service: "nginx", status: "error", count: 18 }] },
    },
  ],
  text: `Finding: 3 hosts down, database-vm RAM **97%**
• Alerts: none firing
• Down: opnsense, minecraft, ark-server (node_exporter unreachable)
• Hot: database-vm RAM 97%
• Logs: 664 nginx 502s to a dead upstream
• Traces: 18 nginx error traces`,
};

test("bad system-health dashboard essay fails the fixture", async () => {
  const fixture = await healthFixture();
  const checks = grade(fixture, badHealth);
  expect(passed(checks)).toBe(false);
  expect(checks.filter((check) => !check.ok).map((check) => check.id)).toEqual(
    expect.arrayContaining([
      "tools.must_call.0.alerting_manage_rules",
      "tools.must_call.1.query_prometheus",
      "tools.must_call.2.query_prometheus",
      "content.must_include.opnsense",
      "style.no_investigation_essay",
      "format.no_markdown_headings",
    ]),
  );
});

test("good system-health operator reply passes the fixture", async () => {
  const fixture = await healthFixture();
  const checks = grade(fixture, goodHealth);
  expect(checks.filter((check) => !check.ok)).toEqual([]);
  expect(passed(checks)).toBe(true);
});

const anyLogsFixture = () => loadFixture("any-error-logs");

test("generic error-logs essay fails", async () => {
  const fixture = await anyLogsFixture();
  const checks = grade(fixture, {
    model: "test",
    usage: {},
    tools: [
      {
        name: "query_loki_logs",
        input: { datasourceUid: "loki", logql: "*" },
        output: { error: "syntax error: unexpected IDENTIFIER" },
      },
    ],
    text: `Based on my investigation, Loki is not functional and I found no error logs.`,
  });
  expect(passed(checks)).toBe(false);
  expect(checks.filter((check) => !check.ok).map((check) => check.id)).toEqual(
    expect.arrayContaining([
      "tools.must_call.0.query_loki_logs",
      "content.must_include_any",
      "style.no_investigation_essay",
    ]),
  );
});

test("generic error-logs summary passes", async () => {
  const fixture = await anyLogsFixture();
  const checks = grade(fixture, {
    model: "test",
    usage: {},
    tools: [
      {
        name: "list_loki_label_names",
        input: { datasourceUid: "loki" },
        output: ["service_name", "detected_level"],
      },
      {
        name: "query_loki_logs",
        input: { datasourceUid: "loki", logql: '{detected_level="error"}' },
        output: { count: 664, note: "664 nginx 502 Bad Gateway" },
      },
    ],
    text: `Finding: **664** error lines, almost all nginx **502**s
• Cause: dead upstream Connection refused
• Other: 7 from download-webhook-api`,
  });
  expect(checks.filter((check) => !check.ok)).toEqual([]);
  expect(passed(checks)).toBe(true);
});

const apiRateFixture = () => loadFixture("api-requests-per-min");

const goodApiRate: AgentTurn = {
  model: "test",
  usage: {},
  tools: [
    {
      name: "list_prometheus_metric_names",
      input: { datasourceUid: "prometheus", regex: ".*request.*" },
      output: [
        "nginx_http_requests_total",
        "prometheus_http_requests_total",
        "webhook_http_requests_total",
      ],
    },
    {
      name: "query_prometheus",
      input: {
        datasourceUid: "prometheus",
        expr: "sum(rate(nginx_http_requests_total[5m])) * 60",
      },
      output: {
        result: [{ metric: { job: "prometheus.scrape.nginx" }, value: [1779220000, "17.8"] }],
        note: "17.8 req/min from rate[5m]*60",
      },
    },
  ],
  text: `Finding: nginx **17.8**/min
• Rate: rate[5m] × 60
• Job: prometheus.scrape.nginx`,
};

test("prometheus scrape as API rate fails the fixture", async () => {
  const fixture = await apiRateFixture();
  const checks = grade(fixture, {
    model: "test",
    usage: {},
    tools: [
      {
        name: "query_prometheus",
        input: { datasourceUid: "prometheus", expr: "sum(rate(prometheus_http_requests_total[5m])) * 60" },
        output: { result: [{ metric: { job: "prometheus" }, value: [1779220000, "57.1"] }] },
      },
    ],
    text: `Finding: **57.1** API requests per min
• Source: prometheus_http_requests_total`,
  });
  expect(passed(checks)).toBe(false);
  expect(checks.filter((check) => !check.ok).map((check) => check.id)).toEqual(
    expect.arrayContaining([
      "tools.must_call_any.0.query_prometheus|query_prometheus|query_prometheus",
      "content.must_not_include.57.1",
    ]),
  );
});

test("ambiguous API req/min operator reply passes with full quality", async () => {
  const fixture = await apiRateFixture();
  const checks = grade(fixture, goodApiRate);
  expect(checks.filter((check) => !check.ok)).toEqual([]);
  expect(passed(checks)).toBe(true);
  expect(gradeQuality(fixture, goodApiRate)).toEqual(
    expect.objectContaining({ score: 5, max: 5 }),
  );
});

test("per-second rate query still passes hard gates but loses quality points", async () => {
  const fixture = await apiRateFixture();
  const turn: AgentTurn = {
    ...goodApiRate,
    tools: [
      goodApiRate.tools[0],
      {
        name: "query_prometheus",
        input: {
          datasourceUid: "prometheus",
          expr: "sum(rate(nginx_http_requests_total[5m]))",
        },
        output: {
          result: [{ metric: { job: "prometheus.scrape.nginx" }, value: [1779220000, "0.297"] }],
          note: "0.297 req/s",
        },
      },
    ],
    text: `Finding: nginx **0.297**/min
• Rate: rate[5m]`,
  };
  expect(passed(grade(fixture, turn))).toBe(true);
  const quality = gradeQuality(fixture, turn);
  expect(quality.score).toBe(3);
  expect(quality.items.find((item) => item.id === "per_minute_query")?.ok).toBe(false);
});

test("named nginx req/min needs 17.8 or 18, not the per-second stub", async () => {
  const fixture = await loadFixture("nginx-requests-per-min");
  const good: AgentTurn = {
    model: "test",
    usage: {},
    tools: [
      {
        name: "query_prometheus",
        input: {
          datasourceUid: "prometheus",
          expr: "sum(rate(nginx_http_requests_total[5m])) * 60",
        },
        output: {
          result: [{ metric: { job: "prometheus.scrape.nginx" }, value: [1779220000, "17.8"] }],
          note: "17.8 req/min from rate[5m]*60",
        },
      },
    ],
    text: `Finding: nginx **17.8**/min
• Job: prometheus.scrape.nginx`,
  };
  expect(passed(grade(fixture, good))).toBe(true);
  expect(gradeQuality(fixture, good).score).toBe(3);
});

test("unfiltered zinohub histogram as 318k fails most-traffic-7d", async () => {
  const fixture = await loadFixture("most-traffic-7d");
  const bad: AgentTurn = {
    model: "test",
    usage: {},
    tools: [
      {
        name: "query_prometheus",
        input: {
          datasourceUid: "prometheus",
          expr: "sum(increase(http_server_request_duration_seconds_count[7d]))",
        },
        output: { result: [{ metric: {}, value: [1779220000, "318298"] }] },
      },
      {
        name: "query_prometheus",
        input: {
          datasourceUid: "prometheus",
          expr: "sum(increase(nginx_http_requests_total[7d]))",
        },
        output: {
          result: [{ metric: { job: "prometheus.scrape.nginx" }, value: [1779220000, "237637"] }],
        },
      },
    ],
    text: `Finding: **zinohub** handles the most traffic
• Traffic: zinohub 318298 requests
• Traffic: nginx 237637 requests`,
  };
  const checks = grade(fixture, bad);
  expect(passed(checks)).toBe(false);
  expect(checks.filter((check) => !check.ok).map((check) => check.id)).toEqual(
    expect.arrayContaining(["content.must_not_include.318"]),
  );
});

test("filtered zinohub and nginx winner passes most-traffic-7d", async () => {
  const fixture = await loadFixture("most-traffic-7d");
  const good: AgentTurn = {
    model: "test",
    usage: {},
    tools: [
      {
        name: "query_prometheus",
        input: {
          datasourceUid: "prometheus",
          expr: "sum(increase(nginx_http_requests_total[7d]))",
        },
        output: {
          result: [{ metric: { job: "prometheus.scrape.nginx" }, value: [1779220000, "237637"] }],
        },
      },
      {
        name: "query_prometheus",
        input: {
          datasourceUid: "prometheus",
          expr: "sum(increase(webhook_http_requests_total[7d]))",
        },
        output: {
          result: [{ metric: { job: "download-webhook-api" }, value: [1779220000, "40384"] }],
        },
      },
      {
        name: "query_prometheus",
        input: {
          datasourceUid: "prometheus",
          expr: 'sum(increase(http_server_request_duration_seconds_count{service_name="zinohub"}[7d]))',
        },
        output: {
          result: [{ metric: { service_name: "zinohub" }, value: [1779220000, "41895"] }],
        },
      },
      {
        name: "query_prometheus",
        input: {
          datasourceUid: "prometheus",
          expr: 'sum(increase(http_server_request_duration_seconds_count{service_name="zinohub",http_route="/health"}[7d]))',
        },
        output: {
          result: [
            { metric: { service_name: "zinohub", http_route: "/health" }, value: [1779220000, "40181"] },
          ],
        },
      },
    ],
    text: `Finding: **Nginx** most HTTP in 7d (**237637**)
• HTTP: zinohub 41895 (40181 /health)
• HTTP: download-webhook-api 40384
• Traffic: Alloy excluded (not a user service)`,
  };
  const checks = grade(fixture, good);
  expect(checks.filter((check) => !check.ok)).toEqual([]);
  expect(passed(checks)).toBe(true);
});

test("all fixture yaml files parse", async () => {
  const fixtures = await loadFixtures(fixturesDir);
  expect(fixtures.map((fixture) => fixture.id).toSorted()).toEqual([
    "any-error-logs",
    "api-requests-per-min",
    "bad-traces",
    "dashboard-search-webhook",
    "empty-query-not-broken",
    "firing-alert",
    "linux-hosts-status",
    "most-traffic-7d",
    "nginx-error-logs",
    "nginx-requests-per-min",
    "silence-alert-write-ban",
    "system-health",
    "webhook-api-requests-per-min",
    "webhook-broker-jobs",
  ]);
});

test("core tag is the prompt-iteration subset", async () => {
  const fixtures = await loadFixtures(fixturesDir, undefined, "core");
  expect(fixtures.map((fixture) => fixture.id).toSorted()).toEqual([
    "api-requests-per-min",
    "bad-traces",
    "dashboard-search-webhook",
    "linux-hosts-status",
    "most-traffic-7d",
    "nginx-error-logs",
    "silence-alert-write-ban",
    "system-health",
  ]);
});
