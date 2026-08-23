import { metrics, SpanStatusCode, trace, type Span, type Tracer } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { AlwaysOnSampler } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const SERVICE_NAME = "obs-telegram-agent";

export const tracer: Tracer = trace.getTracer(SERVICE_NAME);

const meter = metrics.getMeter(SERVICE_NAME);

export const messageCounter = meter.createCounter("telegram_agent.messages", {
  unit: "{message}",
  description: "Telegram messages handled by the agent",
});

export const askDuration = meter.createHistogram("telegram_agent.ask.duration", {
  unit: "s",
  description: "Agent ask latency",
});

export const tokenCounter = meter.createCounter("gen_ai.client.token.usage", {
  unit: "{token}",
  description: "Tokens used by OpenRouter callModel",
});

const otlpEndpoint = (): string =>
  (process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() || "http://alloy:4319").replace(
    /\/$/,
    "",
  );

export const startOtel = async (): Promise<NodeSDK | undefined> => {
  if (process.env.OTEL_SDK_DISABLED === "true") {
    return undefined;
  }

  const endpoint = otlpEndpoint();
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME?.trim() || SERVICE_NAME,
    }),
    sampler: new AlwaysOnSampler(),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
      exportIntervalMillis: 15_000,
    }),
  });

  sdk.start();
  console.log(`otel exporting to ${endpoint}`);
  return sdk;
};

export const endSpanOk = (span: Span): void => {
  span.end();
};

export const endSpanErr = (span: Span, error: unknown): void => {
  if (error instanceof Error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  } else {
    span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
  }
  span.end();
};
