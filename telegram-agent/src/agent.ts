import {
  OpenRouter,
  stepCountIs,
  type ConversationState,
  type StateAccessor,
} from "@openrouter/agent";
import { createMCPTools, type MCPToolsHandle } from "@openrouter/mcp";
import type { Config } from "./config.ts";

const SYSTEM_PROMPT = `You are the obs Telegram agent for a homelab observability stack.

Answer by calling Grafana MCP tools. Never invent metrics. If a query fails or returns empty, say so.

Datasources:
- Prometheus UID: prometheus
- Loki UID: loki
- Tempo UID: tempo

When asked about Linux servers or "state of my servers":
1. Instant query up{job="prometheus.scrape.node_exporter"}
2. Instant query Proxmox health (pve_* on job prometheus.scrape.proxmox, instance 192.168.0.65)
3. For any down or hot host, pull CPU / memory / root disk from node_exporter
4. Reply in short Telegram bullets with units. No tables.

Useful labels:
- node_exporter job: prometheus.scrape.node_exporter
- proxmox job: prometheus.scrape.proxmox
- node instances: zinohub, prod-docker-server, database-vm, opnsense, qbit, minecraft, proxmox, wg, nginx, ark-server, dev-box-vm
- proxmox_guest links: zinohub=Alpine-Jellyfin, prod-docker-server=prod-apps, database-vm=lab-pgdb, qbit=qbit-linux, minecraft=mc-server, wg=wireguard, nginx=ng-alpine, ark-server=ark, dev-box-vm=dev-box-vm
- dashboards: obs-node-exporter, Dp7Cd57Zza (Proxmox), obs-overview

PromQL defaults: queryType instant, datasourceUid prometheus, endTime now.
Read only. Do not create, update, or delete Grafana resources.
Keep replies under 3500 characters.`;

const READ_TOOLS = [
  "query_prometheus",
  "query_prometheus_histogram",
  "list_prometheus_metric_names",
  "list_prometheus_metric_metadata",
  "list_prometheus_label_names",
  "list_prometheus_label_values",
  "list_datasources",
  "get_datasource",
  "check_datasources_health",
  "search_dashboards",
  "get_dashboard_summary",
  "get_dashboard_panel_queries",
  "get_dashboard_property",
  "query_loki_logs",
  "query_loki_stats",
  "query_loki_patterns",
  "generate_deeplink",
  "get_query_examples",
  "run_panel_query",
  "search_folders",
];

const memory = new Map<number, ConversationState | null>();

const stateFor = (chatId: number): StateAccessor => ({
  load: async () => memory.get(chatId) ?? null,
  save: async (state) => {
    memory.set(chatId, state);
  },
});

export class GrafanaAgent {
  private mcp: MCPToolsHandle | undefined;

  constructor(
    private readonly config: Config,
    private readonly client = new OpenRouter({
      apiKey: config.openRouterApiKey,
    }),
  ) {}

  async connect(): Promise<void> {
    this.mcp = await createMCPTools({
      url: this.config.grafanaMcpUrl,
      transport: "streamableHttp",
      includeTools: READ_TOOLS,
      resources: false,
      clientInfo: {
        name: "obs-telegram-agent",
        version: "0.1.0",
      },
    });
  }

  reset(chatId: number): void {
    memory.delete(chatId);
  }

  async ask(chatId: number, text: string): Promise<string> {
    if (!this.mcp) {
      throw new Error("grafana mcp is not connected");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new Error("agent timed out"));
    }, this.config.agentTimeoutMs);

    try {
      const result = this.client.callModel({
        model: this.config.openRouterModel,
        instructions: SYSTEM_PROMPT,
        input: text,
        tools: this.mcp.tools,
        stopWhen: stepCountIs(this.config.maxAgentSteps),
        doomLoop: true,
        state: stateFor(chatId),
        signal: controller.signal,
      });
      const reply = (await result.getText()).trim();
      return reply || "Grafana returned no text. Try a more specific host or metric.";
    } finally {
      clearTimeout(timer);
    }
  }

  async close(): Promise<void> {
    await this.mcp?.close();
  }
}
