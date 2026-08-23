import {
  OpenRouter,
  stepCountIs,
  type ConversationState,
  type StateAccessor,
} from "@openrouter/agent";
import { createMCPTools, type MCPToolsHandle } from "@openrouter/mcp";
import { SpanStatusCode, type Span } from "@opentelemetry/api";
import type { Config } from "./config.ts";
import { askDuration, endSpanErr, endSpanOk, tokenCounter, tracer } from "./otel.ts";

const SYSTEM_PROMPT = `You are the obs Telegram agent for a homelab observability stack.

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
- "webhook broker" / download-webhook-api: HTTP health is probe_success{job="integrations/blackbox/webhook-broker"} (1=up). Target http://192.168.2.10:8081/health. App board zinohub-downloading. Failures: sum(increase(webhook_queue_operations_total{service_name="download-webhook-api", queue_operation=~"retry|drop_max_retries|create_request_failed", queue_operation_success="false"}[10m])). Queue: sum(webhook_queue_size{service_name="download-webhook-api"}). Acks: webhook_ack_total{service_name="download-webhook-api"}. Label is service_name, not job="webhook".
- zinohub HTTP: probe_success{job="integrations/blackbox/zinohub"}
- zino-downloader HTTP: probe_success{job="integrations/blackbox/zino-downloader"}
- Other blackbox jobs: integrations/blackbox/<name>. search_dashboards("webhook") is empty; search download or zinohub.

When asked about Linux servers:
1. up{job="prometheus.scrape.node_exporter"}
2. pve_* job prometheus.scrape.proxmox instance 192.168.0.65
3. CPU / mem / disk for down or hot hosts

Hosts: zinohub, prod-docker-server, database-vm, opnsense, qbit, minecraft, proxmox, wg, nginx, ark-server, dev-box-vm
Dashboards: obs-node-exporter, Dp7Cd57Zza (Proxmox), obs-overview

Reply in short Telegram bullets. No markdown tables. Lead with: still firing or resolved, current number, then 1-3 facts from queries. Under 3500 characters.`;

const READ_TOOLS = [
  "alerting_manage_rules",
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
  "list_loki_label_names",
  "list_loki_label_values",
  "tempo_docs-traceql",
  "tempo_get-attribute-names",
  "tempo_get-attribute-values",
  "tempo_get-trace",
  "tempo_traceql-metrics-instant",
  "tempo_traceql-metrics-range",
  "tempo_traceql-search",
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

    return tracer.startActiveSpan(
      `invoke_agent ${this.config.openRouterModel}`,
      {
        attributes: {
          "gen_ai.operation.name": "invoke_agent",
          "gen_ai.provider.name": "openrouter",
          "gen_ai.request.model": this.config.openRouterModel,
          "gen_ai.agent.name": "obs-telegram-agent",
        },
      },
      async (span) => {
        const started = performance.now();
        const controller = new AbortController();
        const timer = setTimeout(() => {
          controller.abort(new Error("agent timed out"));
        }, this.config.agentTimeoutMs);
        const toolSpans: Span[] = [];

        try {
          const result = this.client.callModel({
            model: this.config.openRouterModel,
            instructions: SYSTEM_PROMPT,
            input: text,
            tools: this.mcp!.tools,
            stopWhen: stepCountIs(this.config.maxAgentSteps),
            doomLoop: true,
            state: stateFor(chatId),
            signal: controller.signal,
            hooks: {
              PreToolUse: [
                {
                  handler: (payload) => {
                    const toolSpan = tracer.startSpan(`execute_tool ${payload.toolName}`, {
                      attributes: {
                        "gen_ai.operation.name": "execute_tool",
                        "gen_ai.tool.name": payload.toolName,
                      },
                    });
                    toolSpans.push(toolSpan);
                  },
                },
              ],
              PostToolUse: [
                {
                  handler: () => {
                    const toolSpan = toolSpans.pop();
                    if (toolSpan) {
                      toolSpan.setStatus({ code: SpanStatusCode.OK });
                      endSpanOk(toolSpan);
                    }
                  },
                },
              ],
              PostToolUseFailure: [
                {
                  handler: (payload) => {
                    const toolSpan = toolSpans.pop();
                    if (toolSpan) {
                      endSpanErr(toolSpan, payload.error);
                    }
                  },
                },
              ],
            },
          });
          const reply = (await result.getText()).trim();
          const usage = await result.getUsage();
          if (usage.inputTokens) {
            tokenCounter.add(usage.inputTokens, {
              "gen_ai.provider.name": "openrouter",
              "gen_ai.token.type": "input",
              "gen_ai.operation.name": "invoke_agent",
            });
            span.setAttribute("gen_ai.usage.input_tokens", usage.inputTokens);
          }
          if (usage.outputTokens) {
            tokenCounter.add(usage.outputTokens, {
              "gen_ai.provider.name": "openrouter",
              "gen_ai.token.type": "output",
              "gen_ai.operation.name": "invoke_agent",
            });
            span.setAttribute("gen_ai.usage.output_tokens", usage.outputTokens);
          }
          span.setStatus({ code: SpanStatusCode.OK });
          return reply || "Grafana returned no text. Try a more specific host or metric.";
        } catch (error) {
          span.recordException(error instanceof Error ? error : new Error(String(error)));
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          });
          throw error;
        } finally {
          for (const leftover of toolSpans) {
            leftover.end();
          }
          askDuration.record((performance.now() - started) / 1000, {
            "gen_ai.provider.name": "openrouter",
          });
          clearTimeout(timer);
          span.end();
        }
      },
    );
  }

  async close(): Promise<void> {
    await this.mcp?.close();
  }
}
