import { tool, type Tool } from "@openrouter/agent";
import { z } from "zod";
import { READ_TOOLS } from "../src/prompt.ts";
import { matchesWhen } from "./match.ts";
import type { Fixture, FixtureToolHandler } from "./schema.ts";

const loose = z.object({}).catchall(z.unknown());

const prometheusQuery = z.object({
  datasourceUid: z.string().optional(),
  expr: z.string().optional(),
  queryType: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  stepSeconds: z.number().optional(),
  projectName: z.string().optional(),
});

const lokiQuery = z.object({
  datasourceUid: z.string().optional(),
  logql: z.string().optional(),
  startRfc3339: z.string().optional(),
  endRfc3339: z.string().optional(),
  limit: z.number().optional(),
  direction: z.string().optional(),
  queryType: z.string().optional(),
  stepSeconds: z.number().optional(),
});

const labelValues = z.object({
  datasourceUid: z.string().optional(),
  labelName: z.string().optional(),
  startRfc3339: z.string().optional(),
  endRfc3339: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
});

const schemas: Record<string, typeof loose> = {
  query_prometheus: prometheusQuery,
  query_prometheus_histogram: prometheusQuery.extend({
    metric: z.string().optional(),
    percentile: z.number().optional(),
    labels: z.string().optional(),
    rateInterval: z.string().optional(),
  }),
  list_prometheus_label_values: labelValues,
  list_prometheus_label_names: labelValues.omit({ labelName: true }),
  list_prometheus_metric_names: z.object({
    datasourceUid: z.string().optional(),
    regex: z.string().optional(),
    limit: z.number().optional(),
  }),
  query_loki_logs: lokiQuery,
  query_loki_stats: lokiQuery,
  query_loki_patterns: lokiQuery,
  list_loki_label_names: labelValues.omit({ labelName: true }),
  list_loki_label_values: labelValues,
  search_dashboards: z.object({
    query: z.string().optional(),
    limit: z.number().optional(),
    page: z.number().optional(),
  }),
  get_dashboard_summary: z.object({ uid: z.string().optional() }),
  get_dashboard_panel_queries: z.object({
    uid: z.string().optional(),
    panelId: z.number().optional(),
  }),
  get_dashboard_property: z.object({
    uid: z.string().optional(),
    jsonPath: z.string().optional(),
  }),
  alerting_manage_rules: z.object({
    operation: z.string().optional(),
    search_rule_name: z.string().optional(),
    rule_uid: z.string().optional(),
    title: z.string().optional(),
    folder_uid: z.string().optional(),
  }),
  list_datasources: z.object({
    type: z.string().optional(),
    limit: z.number().optional(),
  }),
  get_datasource: z.object({
    uid: z.string().optional(),
    name: z.string().optional(),
  }),
  check_datasources_health: z.object({
    type: z.string().optional(),
    uids: z.array(z.string()).optional(),
  }),
  search_folders: z.object({ query: z.string().optional() }),
  get_query_examples: z.object({ datasourceType: z.string().optional() }),
  "tempo_traceql-search": z.object({
    query: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
  }),
  "tempo_traceql-metrics-instant": z.object({
    query: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
  }),
  "tempo_get-trace": z.object({ trace_id: z.string().optional() }),
  "tempo_get-attribute-names": z.object({ scope: z.string().optional() }),
  "tempo_get-attribute-values": z.object({
    name: z.string().optional(),
    "filter-query": z.string().optional(),
  }),
};

const descriptions: Record<string, string> = {
  query_prometheus:
    "Run PromQL. expr is required. datasourceUid must be prometheus. Use queryType instant and endTime now unless you need a range. Never call with an empty expr.",
  query_loki_logs:
    'Query Loki logs. datasourceUid must be loki. logql must be a stream selector like {service_name="nginx"} |= "error". Never use "*".',
  query_loki_stats:
    "Index-level Loki stream stats. logql must be a simple label selector, no line filters.",
  list_loki_label_names: "List Loki label names. Call this before guessing service_name.",
  list_loki_label_values: "List values for a Loki label, e.g. labelName=service_name.",
  list_prometheus_label_values:
    "List Prometheus label values. Use labelName=job when a query is empty.",
  list_prometheus_label_names: "List Prometheus label names.",
  list_prometheus_metric_names: "List Prometheus metric names, optionally filtered by regex.",
  search_dashboards: "Search Grafana dashboards by title. search webhook is empty; try the service name.",
  get_dashboard_summary: "Dashboard overview by UID.",
  get_dashboard_panel_queries: "Panel PromQL/LogQL from a dashboard UID.",
  alerting_manage_rules: "Alert rules. operation must be list or get only. Never create, update, or delete.",
  list_datasources: "List Grafana datasources. UIDs are prometheus, loki, tempo.",
  get_datasource: "Get one datasource by uid or name.",
  check_datasources_health: "Datasource health. Use only after a query itself fails.",
  search_folders: "Search Grafana folders.",
  get_query_examples: "Example PromQL or LogQL for a datasource type.",
  "tempo_traceql-search":
    'Search traces. Use status=error or error=true after you have a service_name. Example: {resource.service.name="nginx" && status=error}',
  "tempo_traceql-metrics-instant": "Instant TraceQL metrics, e.g. error rate by service.",
  "tempo_get-trace": "Fetch one trace by trace_id.",
  "tempo_get-attribute-names": "List Tempo attribute names. Prefer resource.service.name.",
  "tempo_get-attribute-values": "List values for a Tempo attribute such as resource.service.name.",
};

const unmatchedResult = (name: string, input: Record<string, unknown>): unknown => {
  if (name === "query_loki_logs" || name === "query_loki_stats" || name === "query_loki_patterns") {
    const logql = String(input.logql ?? "");
    if (!logql.includes("{") || logql.includes("*")) {
      return { error: 'syntax error: unexpected IDENTIFIER' };
    }
    return { logs: [], entries: 0 };
  }
  if (name === "query_prometheus" || name === "query_prometheus_histogram") {
    if (input.datasourceUid && input.datasourceUid !== "prometheus") {
      return { error: `datasource ${String(input.datasourceUid)} is not accessible for querying` };
    }
    return { result: [], resultType: "vector" };
  }
  if (
    name.startsWith("list_") ||
    name === "search_dashboards" ||
    name === "search_folders"
  ) {
    return [];
  }
  return { result: [] };
};

export const resolveFixtureResult = (
  handlers: FixtureToolHandler[],
  name: string,
  input: Record<string, unknown>,
): unknown => {
  const match = handlers.find(
    (handler) => handler.name === name && matchesWhen(input, handler.when),
  );
  if (match) {
    return match.result;
  }
  return unmatchedResult(name, input);
};

export const createFixtureTools = (fixture: Fixture): Tool[] =>
  READ_TOOLS.map((name) => {
    return tool({
      name,
      description: descriptions[name] ?? `Grafana MCP tool ${name}`,
      inputSchema: schemas[name] ?? loose,
      execute: async (params) =>
        resolveFixtureResult(fixture.tools, name, params as Record<string, unknown>),
    });
  });
