import {
  OpenRouter,
  stepCountIs,
  type ConversationState,
  type StateAccessor,
  type Tool,
} from "@openrouter/agent";
import { createMCPTools, type MCPToolsHandle } from "@openrouter/mcp";
import { SpanStatusCode, type Span } from "@opentelemetry/api";
import type { AgentSettings } from "./config.ts";
import { askDuration, endSpanErr, endSpanOk, tokenCounter, tracer } from "./otel.ts";
import { READ_TOOLS, SYSTEM_PROMPT } from "./prompt.ts";

const memory = new Map<number, ConversationState | null>();

const stateFor = (chatId: number): StateAccessor => ({
  load: async () => memory.get(chatId) ?? null,
  save: async (state) => {
    memory.set(chatId, state);
  },
});

export type ToolEvent = {
  name: string;
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
};

export type AgentTurn = {
  text: string;
  tools: ToolEvent[];
  usage: { inputTokens?: number; outputTokens?: number; cost?: number };
  model: string;
};

export type AgentRunInput = {
  chatId: number;
  text: string;
  model?: string;
  tools?: readonly Tool[];
  instructions?: string;
};

const recordTokenUsage = (
  span: Span,
  usage: { inputTokens?: number; outputTokens?: number },
): void => {
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
};

const completeToolEvent = (
  events: ToolEvent[],
  name: string,
  patch: Pick<ToolEvent, "output" | "error">,
): void => {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.name === name && event.output === undefined && event.error === undefined) {
      Object.assign(event, patch);
      return;
    }
  }
};

export class GrafanaAgent {
  private mcp: MCPToolsHandle | undefined;

  constructor(
    private readonly config: AgentSettings,
    private readonly client = new OpenRouter({
      apiKey: config.openRouterApiKey,
    }),
  ) {}

  async connect(): Promise<void> {
    if (!this.config.grafanaMcpUrl) {
      throw new Error("grafana mcp url is required to connect");
    }
    this.mcp = await createMCPTools({
      url: this.config.grafanaMcpUrl,
      transport: "streamableHttp",
      includeTools: [...READ_TOOLS],
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
    const turn = await this.run({ chatId, text });
    return turn.text;
  }

  async run(input: AgentRunInput): Promise<AgentTurn> {
    const tools = input.tools ?? this.mcp?.tools;
    if (!tools) {
      throw new Error("grafana mcp is not connected");
    }

    const model = input.model ?? this.config.openRouterModel;
    const fallbacks = input.model
      ? []
      : this.config.openRouterFallbacks.filter((name) => name !== model);

    return tracer.startActiveSpan(
      `invoke_agent ${model}`,
      {
        attributes: {
          "gen_ai.operation.name": "invoke_agent",
          "gen_ai.provider.name": "openrouter",
          "gen_ai.request.model": model,
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
        const toolEvents: ToolEvent[] = [];

        try {
          const result = this.client.callModel({
            model,
            ...(fallbacks.length > 0 ? { models: fallbacks } : {}),
            instructions: input.instructions ?? SYSTEM_PROMPT,
            input: input.text,
            tools: [...tools],
            stopWhen: stepCountIs(this.config.maxAgentSteps),
            doomLoop: true,
            state: stateFor(input.chatId),
            signal: controller.signal,
            provider: { sort: "throughput" },
            hooks: {
              PreToolUse: [
                {
                  handler: (payload) => {
                    toolEvents.push({
                      name: payload.toolName,
                      input: payload.toolInput,
                    });
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
                  handler: (payload) => {
                    completeToolEvent(toolEvents, payload.toolName, {
                      output: payload.toolOutput,
                    });
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
                    const message =
                      payload.error instanceof Error
                        ? payload.error.message
                        : String(payload.error);
                    completeToolEvent(toolEvents, payload.toolName, { error: message });
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
          recordTokenUsage(span, usage);
          span.setStatus({ code: SpanStatusCode.OK });
          return {
            text: reply || "Grafana returned no text. Try a more specific host or metric.",
            tools: toolEvents,
            usage: {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              cost: usage.cost,
            },
            model,
          };
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
