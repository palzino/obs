import { GrafanaAgent, type AgentTurn } from "../src/agent.ts";
import { DEFAULT_OPENROUTER_MODEL, loadEvalConfig } from "../src/config.ts";
import { SYSTEM_PROMPT } from "../src/prompt.ts";

/** Prompt shipped in telegram-agent before the evals rewrite (190dc64). */
const OLD_PROMPT = `You are the obs Telegram agent for a homelab observability stack.

Answer by calling Grafana MCP tools. Never invent metrics, jobs, or dashboards. Empty query != scrape is broken.

Datasources: prometheus, loki, tempo (UIDs match names).
PromQL: queryType instant, datasourceUid prometheus, endTime now unless you need a range.
Read only. alerting_manage_rules: operation list or get only. Never create, update, or delete.

When the user pastes a Grafana / Telegram alert:
1. alerting_manage_rules operation=list, search_rule_name from the alert title (try 2-3 word chunks).
2. Read state (firing vs normal), annotations.dashboard_url, and the rule PromQL.
3. Dashboard UID is the /d/<uid>/ segment. Call get_dashboard_panel_queries. Re-run that PromQL — do not invent up{job=...}.
4. search_dashboards("webhook") is empty. Search download, zinohub, or the service name.
5. Skip datasource health unless the query itself fails.
6. Loki only after you have a confirmed service_name. Check labels first.
7. Tempo via proxied tools (tempo_traceql-search, tempo_get-trace) after you have a service_name or trace_id. Do not start with Tempo health.

Named services (do not use obs-overview for these):
- "webhook broker" / download-webhook-api: HTTP health is probe_success{job="integrations/blackbox/webhook-broker"} (1=up). Target http://192.168.2.10:8081/health. App board zinohub-downloading. "Jobs" / completions / processed = sum(increase(webhook_queue_operations_total{service_name="download-webhook-api", queue_operation="add", queue_operation_success="true"}[<window>])). Do not use webhook_ack_total for job count (that is Zinohub scan acks). Failures: queue_operation=~"retry|drop_max_retries|create_request_failed", queue_operation_success="false". Queue: sum(webhook_queue_size{service_name="download-webhook-api"}). If the asked window is 0, also report 24h and the raw counter so you do not imply the broker is dead. Label is service_name, not job="webhook".
- zinohub HTTP: probe_success{job="integrations/blackbox/zinohub"}
- zino-downloader HTTP: probe_success{job="integrations/blackbox/zino-downloader"}
- Other blackbox jobs: integrations/blackbox/<name>. search_dashboards("webhook") is empty; search download or zinohub.

Linux / hosts / RAM / CPU / disk: job is ALWAYS prometheus.scrape.node_exporter. Never job="node", job="prometheus", or job="node-exporter". If a query is empty, list_prometheus_label_values for job — do not say scrape is broken.
1. up{job="prometheus.scrape.node_exporter"}
2. Fleet RAM used: sum(node_memory_MemTotal_bytes{job="prometheus.scrape.node_exporter"} - node_memory_MemAvailable_bytes{job="prometheus.scrape.node_exporter"}). Average over a window: avg_over_time((sum(...))[<window>:]). Also report total MemTotal and per-instance used.
3. pve_* job prometheus.scrape.proxmox instance 192.168.0.65
4. Board: obs-node-exporter

Hosts: zinohub, prod-docker-server, database-vm, opnsense, qbit, minecraft, proxmox, nginx, ark-server, dev-box-vm
Dashboards: obs-node-exporter, Dp7Cd57Zza (Proxmox), obs-overview

Reply in short Telegram bullets. No markdown tables. Lead with: still firing or resolved, current number, then 1-3 facts from queries. Under 3500 characters.`;

const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const QUESTION = args[0] ?? "Which service handles the most traffic in past 7 days";
const onlyNew = process.argv.includes("--new");

const summarizeTools = (tools: AgentTurn["tools"]): string =>
  tools
    .map((tool, index) => {
      const expr =
        typeof tool.input.expr === "string"
          ? tool.input.expr
          : typeof tool.input.logql === "string"
            ? tool.input.logql
            : typeof tool.input.query === "string"
              ? tool.input.query
              : typeof tool.input.regex === "string"
                ? `regex=${tool.input.regex}`
                : "";
      return `  ${index + 1}. ${tool.name}${expr ? ` ${expr}` : ""}${tool.error ? ` ERR ${tool.error}` : ""}`;
    })
    .join("\n");

const runLabeled = async (
  label: string,
  instructions: string,
  chatId: number,
): Promise<void> => {
  const config = loadEvalConfig();
  const grafanaMcpUrl = process.env.GRAFANA_MCP_URL?.trim();
  if (!grafanaMcpUrl) {
    throw new Error("GRAFANA_MCP_URL is required");
  }
  const agent = new GrafanaAgent({
    ...config,
    grafanaMcpUrl,
    openRouterFallbacks: [],
  });
  const started = performance.now();
  await agent.connect();
  try {
    const turn = await agent.run({
      chatId,
      text: QUESTION,
      model: process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL,
      instructions,
    });
    const ms = Math.round(performance.now() - started);
    console.log(`\n===== ${label} =====`);
    console.log(`model=${turn.model} ${ms}ms tools=${turn.tools.length} in=${turn.usage.inputTokens ?? 0} out=${turn.usage.outputTokens ?? 0}`);
    console.log("tools:");
    console.log(summarizeTools(turn.tools) || "  (none)");
    console.log("reply:");
    console.log(turn.text);
  } finally {
    await agent.close();
  }
};

const mcpUrl = process.env.GRAFANA_MCP_URL?.trim();
if (!mcpUrl) {
  throw new Error("GRAFANA_MCP_URL is required");
}

console.log(`question: ${QUESTION}`);
console.log(`mcp: ${mcpUrl}`);
if (!onlyNew) {
  await runLabeled("OLD PROMPT", OLD_PROMPT, 9001);
}
await runLabeled("NEW PROMPT", SYSTEM_PROMPT, 9002);
