const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`missing required env ${name}`);
  }
  return value;
};

const csvNumbers = (value: string): Set<number> => {
  const ids = new Set<number>();
  for (const part of value.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const id = Number(trimmed);
    if (!Number.isSafeInteger(id)) {
      throw new Error(`TELEGRAM_ALLOWED_CHAT_IDS has invalid id: ${part}`);
    }
    ids.add(id);
  }
  if (ids.size === 0) {
    throw new Error("TELEGRAM_ALLOWED_CHAT_IDS must list at least one chat id");
  }
  return ids;
};

export const DEFAULT_OPENROUTER_MODEL = "deepseek/deepseek-v4-flash-0731:nitro";
export const DEFAULT_OPENROUTER_FALLBACKS = ["z-ai/glm-5.3-flashx"];

const csvStrings = (value: string | undefined, fallback: string[]): string[] => {
  if (value === undefined) {
    return fallback;
  }
  return value.split(",").map((part) => part.trim()).filter(Boolean);
};

export type AgentSettings = {
  openRouterApiKey: string;
  openRouterModel: string;
  openRouterFallbacks: string[];
  agentTimeoutMs: number;
  maxAgentSteps: number;
  grafanaMcpUrl?: string;
};

export type Config = AgentSettings & {
  telegramBotToken: string;
  allowedChatIds: Set<number>;
  grafanaMcpUrl: string;
  healthPort: number;
};

const agentSettings = (): AgentSettings => ({
  openRouterApiKey: required("OPENROUTER_API_KEY"),
  openRouterModel: process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL,
  openRouterFallbacks: csvStrings(
    process.env.OPENROUTER_FALLBACK_MODELS,
    DEFAULT_OPENROUTER_FALLBACKS,
  ),
  agentTimeoutMs: Number(process.env.AGENT_TIMEOUT_MS || "90000"),
  maxAgentSteps: Number(process.env.AGENT_MAX_STEPS || "12"),
});

export const loadEvalConfig = (): AgentSettings => agentSettings();

export const loadConfig = (): Config => ({
  ...agentSettings(),
  telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
  allowedChatIds: csvNumbers(required("TELEGRAM_ALLOWED_CHAT_IDS")),
  grafanaMcpUrl: process.env.GRAFANA_MCP_URL?.trim() || "http://mcp-grafana:8000/mcp",
  healthPort: Number(process.env.HEALTH_PORT || "8080"),
});
